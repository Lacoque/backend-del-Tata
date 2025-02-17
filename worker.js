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

// Función para agregar encabezados CORS
function addCorsHeaders(response) {
  response.headers.set('Access-Control-Allow-Origin', '*'); // Permite solicitudes desde cualquier origen
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // Métodos permitidos
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type'); // Encabezados permitidos
  return response;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      console.log(`Método recibido: ${request.method}`);
      console.log(`Ruta recibida: ${url.pathname}`);

      // Accede a las variables de entorno
      const credentials = JSON.parse(env.GOOGLE_DRIVE_CREDENTIALS);
      const privateKey = credentials.private_key.replace(/\\n/g, '\n').trim();
      const clientEmail = credentials.client_email;

      // Maneja solicitudes CORS (preflight)
      if (request.method === 'OPTIONS') {
        return addCorsHeaders(new Response(null, { status: 204 }));
      }

      // Endpoint para obtener el token de acceso
      if (request.method === 'GET' && url.pathname === '/get-access-token') {
        try {
          const accessToken = await generateGoogleDriveAccessToken(privateKey, clientEmail);
          console.log('Token de acceso generado:', accessToken);
          return addCorsHeaders(
            new Response(JSON.stringify({ accessToken }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        } catch (error) {
          console.error('Error al generar el token de acceso:', error);
          return addCorsHeaders(
            new Response(JSON.stringify({ error: 'Error al generar el token de acceso' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
      }

      // Endpoint para procesar los datos del formulario
      if (request.method === 'POST' && url.pathname === '/process-form') {
        try {
          const formData = await request.json();
          console.log('Datos recibidos:', formData);

          // Validación de datos
          const { nombre, email, grupo, espectaculo, sinopsis, duracion, fileUrls } = formData;
          if (!nombre || !email || !grupo || !espectaculo || !sinopsis || !duracion || !fileUrls?.length) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Faltan datos obligatorios en el formulario' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          }

          console.log('Datos enviados a Email.js:', formData);

          // Envía el correo electrónico usando EmailJS
          const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: env.EMAILJS_SERVICE_ID,
              template_id: env.EMAILJS_TEMPLATE_ID,
              user_id: env.EMAILJS_PRIVATE_KEY,
              template_params: formData,
            }),
          });

          // Logs para depurar la respuesta de EmailJS
          const emailResponseBody = await emailResponse.text();
          console.log('Respuesta de EmailJS:', emailResponseBody);

          if (emailResponseBody === "OK") {
            return addCorsHeaders(
              new Response(null, { // Respuesta vacía
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          } else {
            throw new Error('Respuesta inesperada de EmailJS');
          }
        } catch (error) {
          console.error('Error al procesar el formulario:', error.message || error);
          return addCorsHeaders(
            new Response(JSON.stringify({ error: error.message || 'Error interno del servidor' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
      }

      // Manejar otras rutas o métodos no permitidos
      return addCorsHeaders(
        new Response(JSON.stringify({ error: 'Método no permitido' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch (error) {
      console.error('Error:', error);
      return addCorsHeaders(
        new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  },
};