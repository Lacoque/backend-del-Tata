import { SignJWT, importPKCS8 } from 'jose';

const GOOGLE_DRIVE_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// Función para generar un token JWT
async function generateGoogleDriveAccessToken(privateKey, clientEmail) {
  try {
    const privateKeyJWK = await importPKCS8(privateKey, 'RS256');
    const jwt = await new SignJWT({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets.readonly',
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
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS'); // Métodos permitidos
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
            new Response(JSON.stringify({ status: "success", accessToken }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        } catch (error) {
          console.error('Error al generar el token de acceso:', error);

          return addCorsHeaders(
            new Response(JSON.stringify({ status: "error", message: "Error al generar el token de acceso" }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
      }
          //  Google Sheets
          if (request.method === 'GET' && url.pathname === '/sheet-data') {
            try {
            const day = url.searchParams.get('day');
             if (!day) throw new Error("Falta el parámetro 'day'");
                  const allowedDays = ['Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado',]; 
             if (!allowedDays.includes(day)) {
                 throw new Error(`Día inválido. Valores permitidos: ${allowedDays.join(', ')}`);
    }
    const accessToken = await generateGoogleDriveAccessToken(privateKey, clientEmail);
              
              const spreadsheetId = '166XDOCcLB-dQFosif3sxkgIsWvwS5qd_W5UL-PZk2_g'; 
              const range = `'${day}'!A1:D7`;
    
              const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?access_token=${accessToken}`
              );
    
              if (!response.ok) throw new Error('Error al obtener datos de Sheets');
    
              const data = await response.json();
              return addCorsHeaders(new Response(JSON.stringify(data), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }));
    
            } catch (error) {
              console.error('Error en /sheet-data:', error);
              return addCorsHeaders(new Response(JSON.stringify({
                status: "error",
                message: "Error al obtener datos de Sheets"
              }), { status: 500 }));
            }
          } 

      // Manejar otras rutas o métodos no permitidos
      return addCorsHeaders(
        new Response(JSON.stringify({ status: "error", message: "Método no permitido" }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch (error) {
      console.error('Error inesperado:', error);

      return addCorsHeaders(
        new Response(JSON.stringify({ status: "error", message: "Error inesperado" }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  },
};