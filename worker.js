import { SignJWT, importPKCS8 } from 'jose';

// URLs de las APIs
const GOOGLE_DRIVE_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const EMAIL_JS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

// Función para generar un token JWT
async function generateGoogleDriveAccessToken(privateKey, clientEmail) {
  try {
    // Importa la clave privada en formato PKCS#8
    const privateKeyJWK = await importPKCS8(privateKey, 'RS256');

    // Genera el token JWT
    const jwt = await new SignJWT({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: Math.floor(Date.now() / 1000) + 3600, // Expira en 1 hora
      iat: Math.floor(Date.now() / 1000), // Tiempo actual
    })
      .setProtectedHeader({ alg: 'RS256' }) // Algoritmo RS256
      .sign(privateKeyJWK); // Firma el token con la clave privada
      console.log('Token JWT generado:', jwt);

    // Usa el token JWT para obtener un token de acceso
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error al obtener el token de acceso: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error al generar el token JWT:', error);
    throw error;
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Maneja solicitudes CORS (preflight)
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204, // No Content
          headers: {
            'Access-Control-Allow-Origin': '*', // Permite solicitudes desde cualquier origen
            'Access-Control-Allow-Methods': 'POST, OPTIONS', // Métodos permitidos
            'Access-Control-Allow-Headers': 'Content-Type', // Encabezados permitidos
          },
        });
      }

      // Accede al JSON completo de las credenciales desde `env`
      const credentials = JSON.parse(env.GOOGLE_DRIVE_CREDENTIALS);
      const privateKey = credentials.private_key.replace(/\\n/g, '\n').trim(); // Asegura los saltos de línea
      const clientEmail = credentials.client_email;

      // Accede a otras variables de entorno
      const GOOGLE_DRIVE_FOLDER_ID = env.GOOGLE_DRIVE_FOLDER_ID;
      const EMAILJS_SERVICE_ID = env.EMAILJS_SERVICE_ID;
      const EMAILJS_TEMPLATE_ID = env.EMAILJS_TEMPLATE_ID;
      const EMAILJS_USER_ID = env.EMAILJS_USER_ID;

      // Verifica que las credenciales se cargaron correctamente
      console.log('Clave privada recibida:', privateKey);
      console.log('Correo electrónico del cliente:', clientEmail);

      // Maneja la solicitud POST al endpoint `/upload`
      if (request.method === 'POST' && url.pathname === '/upload') {
        const formData = await request.formData();
        const files = formData.getAll('files'); // Archivos adjuntos
        const nombre = formData.get('nombre');
        const email = formData.get('email');
        const grupo = formData.get('grupo');
        const espectaculo = formData.get('espectaculo');
        const sinopsis = formData.get('sinopsis');
        const duracion = formData.get('duracion');

        // Paso 1: Generar token de acceso para Google Drive
        const accessToken = await generateGoogleDriveAccessToken(privateKey, clientEmail);

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
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Manejar otras rutas o métodos no permitidos
      return new Response('Método no permitido', { status: 405 });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};