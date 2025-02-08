import { Router } from 'itty-router';

// Crea un router para manejar rutas
const router = Router();

// Middleware para agregar encabezados CORS
const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Permite solicitudes desde cualquier origen (*)
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Métodos HTTP permitidos
    "Access-Control-Allow-Headers": "Content-Type" // Encabezados permitidos
};

// Maneja solicitudes OPTIONS (preflight)
router.options('*', () => {
    return new Response(null, {
        headers: corsHeaders
    });
});

// Endpoint para subir archivos a Google Drive
router.post('/upload', async (request) => {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');
        const email = formData.get('email'); // Obtener el correo del formulario

        // Sube cada archivo a Google Drive
        const fileLinks = await Promise.all(
            files.map(async (file) => {
                const buffer = await file.arrayBuffer();

                // Genera un token JWT para autenticación
                const jwtToken = generateJWT();

                // Sube el archivo a Google Drive
                const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        'Content-Type': 'multipart/related; boundary=boundary'
                    },
                    body: `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name": "${file.name}"}\r\n--boundary\r\nContent-Type: ${file.type}\r\n\r\n${Buffer.from(buffer).toString('base64')}\r\n--boundary--`
                });

                const uploadData = await uploadResponse.json();
                const fileId = uploadData.id;

                // Haz el archivo público
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ role: 'reader', type: 'anyone' })
                });

                // Obtiene el enlace público del archivo
                const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink`);
                const fileData = await fileResponse.json();

                return fileData.webContentLink;
            })
        );

        // Envía los enlaces por correo usando EmailJS
        await sendEmail(email, fileLinks);

        return new Response(JSON.stringify({ links: fileLinks }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    }
});

// Función para generar un JWT
function generateJWT() {
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claimSet = btoa(JSON.stringify({
        iss: GOOGLE_DRIVE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
    }));

    const unsignedToken = `${header}.${claimSet}`;
    const privateKey = GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n');

    // Firma el token con la clave privada
    const signature = crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(unsignedToken)
    );

    return `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

// Función para enviar correos con EmailJS
async function sendEmail(email, fileLinks) {
    const emailTemplate = `
        <h1>Tus archivos han sido cargados exitosamente</h1>
        <p>Aquí están los enlaces:</p>
        <ul>
            ${fileLinks.map(link => `<li><a href="${link}">${link}</a></li>`).join('')}
        </ul>
    `;

    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_USER_ID,
            template_params: {
                to_email: email,
                message: emailTemplate
            }
        })
    });
}

// Maneja todas las demás rutas
router.all('*', () => new Response('Not Found', { status: 404 }));

// Exporta el Worker
export default {
    fetch: (request, env, ctx) => router.handle(request, env, ctx)
};