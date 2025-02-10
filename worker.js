// worker.js

import { SignJWT } from 'jose'; // Importa SignJWT desde jose

const GOOGLE_DRIVE_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const EMAIL_JS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

// Función para generar un token JWT
async function generateGoogleDriveAccessToken(privateKey, clientEmail) {
  const now = Math.floor(Date.now() / 1000);

  const encodedPrivateKey = new TextEncoder().encode(privateKey); // Convierte la clave privada a Uint8Array

  const jwt = await new SignJWT({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, // Expira en 1 hora
    iat: now,
  })
    .setProtectedHeader({ alg: 'RS256' }) // Algoritmo RS256
    .sign(encodedPrivateKey); // Firma el token con la clave privada

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  return data.access_token;
}

export default {
  async fetch(request, env) {
    try {
      // Accede a las variables de entorno desde `env`
      const GOOGLE_DRIVE_FOLDER_ID = env.GOOGLE_DRIVE_FOLDER_ID;
      const GOOGLE_DRIVE_PRIVATE_KEY = env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'); // Asegúrate de que los saltos de línea estén correctamente formateados
      const GOOGLE_DRIVE_CLIENT_EMAIL = env.GOOGLE_DRIVE_CLIENT_EMAIL;

      const EMAILJS_SERVICE_ID = env.EMAILJS_SERVICE_ID;
      const EMAILJS_TEMPLATE_ID = env.EMAILJS_TEMPLATE_ID;
      const EMAILJS_USER_ID = env.EMAILJS_USER_ID;

      if (request.method === 'POST' && request.url.includes('/upload')) {
        const formData = await request.formData();
        const files = formData.getAll('files'); // Archivos adjuntos
        const nombre = formData.get('nombre');
        const email = formData.get('email');
        const grupo = formData.get('grupo');
        const espectaculo = formData.get('espectaculo');
        const sinopsis = formData.get('sinopsis');
        const duracion = formData.get('duracion');

        // Paso 1: Generar token de acceso para Google Drive
        const accessToken = await generateGoogleDriveAccessToken(
          GOOGLE_DRIVE_PRIVATE_KEY,
          GOOGLE_DRIVE_CLIENT_EMAIL
        );

        // Paso 2: Subir archivos a Google Drive
        const fileUrls = await Promise.all(
          files.map(async (file) => {
            const response = await fetch(`${GOOGLE_DRIVE_API_URL}?uploadType=multipart`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'multipart/related; boundary=boundary',
              },
              body: `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{
                "name": "${file.name}",
                "parents": ["${GOOGLE_DRIVE_FOLDER_ID}"]
              }\r\n--boundary\r\nContent-Type: ${file.type}\r\n\r\n${await file.text()}\r\n--boundary--`,
            });

            if (!response.ok) {
              throw new Error(`Error al subir el archivo ${file.name} a Google Drive`);
            }

            const data = await response.json();
            return `https://drive.google.com/file/d/${data.id}/view`; // URL pública del archivo
          })
        );

        // Paso 3: Enviar los datos del formulario por Email.js
        const emailResponse = await fetch(EMAIL_JS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_USER_ID,
            template_params: {
              nombre,
              email,
              grupo,
              espectaculo,
              sinopsis,
              duracion,
              archivos: fileUrls.join(', '), // URLs de los archivos subidos
            },
          }),
        });

        if (!emailResponse.ok) {
          throw new Error('Error al enviar el correo electrónico');
        }

        // Respuesta exitosa
        return new Response(JSON.stringify({ message: 'Formulario enviado correctamente' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Manejar otras rutas o métodos no permitidos
      return new Response('Método no permitido', { status: 405 });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};