import { SignJWT, importPKCS8 } from 'jose';
const GOOGLE_DRIVE_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const EMAIL_JS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

// Función para generar un token JWT
async function generateGoogleDriveAccessToken(privateKey, clientEmail) {
  try {
    const privateKeyJWK = await importPKCS8(privateKey, 'RS256');
    const jwt = await new SignJWT({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: Math.floor(Date.now() / 1000) + 3600, // Expira en 1 hora
      iat: Math.floor(Date.now() / 1000), // Tiempo actual
    })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKeyJWK);
    console.log('Token JWT generado:', jwt);
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`Error al obtener el token de acceso: ${response.status} ${response.statusText}. Detalles: ${errorDetails}`);
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

      // Accede a las variables de entorno desde `env`
      const EMAILJS_SERVICE_ID = env.EMAILJS_SERVICE_ID;
      const EMAILJS_TEMPLATE_ID = env.EMAILJS_TEMPLATE_ID;
      const EMAILJS_PUBLIC_KEY = env.EMAILJS_PUBLIC_KEY;

      console.log('EMAILJS_SERVICE_ID:', EMAILJS_SERVICE_ID);
      console.log('EMAILJS_TEMPLATE_ID:', EMAILJS_TEMPLATE_ID);
      console.log('EMAILJS_PUBLIC_KEY:', EMAILJS_PUBLIC_KEY);

      // Endpoint para procesar los datos del formulario
      if (request.method === 'POST' && url.pathname === '/process-form') {
        const formData = await request.json();

        const { nombre, email, grupo, espectaculo, sinopsis, duracion, fileUrls } = formData;

        // Validación de datos
        if (!nombre || !email || !grupo || !espectaculo || !sinopsis || !duracion || !fileUrls.length) {
          throw new Error('Faltan datos obligatorios en el formulario');
        }

        console.log('Datos enviados a Email.js:', {
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          public_key: EMAILJS_PUBLIC_KEY,
          template_params: {
            nombre,
            email,
            grupo,
            espectaculo,
            sinopsis,
            duracion,
            archivos: fileUrls.join(', '),
          },
        });

        const emailResponse = await fetch(EMAIL_JS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY, // Usa la clave pública en lugar del antiguo user_id
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
          const errorDetails = await emailResponse.text(); // Captura la respuesta completa
          console.error('Error al enviar el correo electrónico:', errorDetails);
          throw new Error(`Error al enviar el correo electrónico: ${errorDetails}`);
        }

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