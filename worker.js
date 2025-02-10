// Importa la función `sign` para generar tokens JWT
import { sign } from '@cfworker/jwt';

// Código mínimo de itty-router
const Router = () => {
    const routes = [];
    const router = async (request, ...args) => {
        for (const route of routes) {
            const match = request.url.match(route.pattern);
            if (match) {
                const params = Object.fromEntries(
                    [...match.slice(1)].map((value, index) => [route.keys[index] || index, value])
                );
                return await route.handler({ request, params }, ...args);
            }
        }
        return new Response("Not Found", { status: 404 });
    };
    router.get = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
    router.post = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
    router.options = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
    router.all = (pattern, handler) => routes.push({ pattern, handler, keys: [] });
    return router;
};

// Exporta el router
export { Router };

// Inicializa el router
const router = Router();

// Encabezados CORS
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

// Maneja solicitudes OPTIONS para CORS
router.options('*', () => {
    return new Response(null, {
        headers: corsHeaders
    });
});

// Ruta POST para subir archivos
router.post('/upload', async (request, env) => {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');
        const email = formData.get('email');

        // Procesa cada archivo
        const fileLinks = await Promise.all(
            files.map(async (file) => {
                const buffer = await file.arrayBuffer();
                const base64Data = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                const jwtToken = generateJWT(env);

                // Sube el archivo a Google Drive
                const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        'Content-Type': 'multipart/related; boundary=boundary'
                    },
                    body: `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name": "${file.name}"}\r\n--boundary\r\nContent-Type: ${file.type}\r\n\r\n${base64Data}\r\n--boundary--`
                });

                const uploadData = await uploadResponse.json();
                const fileId = uploadData.id;

                // Configura permisos públicos para el archivo
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

        // Envía un correo electrónico con los enlaces
        await sendEmail(email, fileLinks);

        // Devuelve los enlaces como respuesta
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

// Genera un token JWT para autenticación con Google Drive
function generateJWT(env) {
    const claimSet = {
        iss: env.GOOGLE_DRIVE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
    };
    const privateKey = env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n');
    return sign(claimSet, privateKey, 'RS256');
}

// Envía un correo electrónico con los enlaces de los archivos
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
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_USER_ID,
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
