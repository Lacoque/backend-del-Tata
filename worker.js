import { Router } from 'https://cdn.skypack.dev/itty-router';

const router = Router();

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

router.options('*', () => {
    return new Response(null, {
        headers: corsHeaders
    });
});

router.post('/upload', async (request, env) => {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');
        const email = formData.get('email');

        const fileLinks = await Promise.all(
            files.map(async (file) => {
                const buffer = await file.arrayBuffer();
                const base64Data = btoa(String.fromCharCode(...new Uint8Array(buffer)));

                const jwtToken = generateJWT(env);

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

                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ role: 'reader', type: 'anyone' })
                });

                const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink`);
                const fileData = await fileResponse.json();
                return fileData.webContentLink;
            })
        );

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

function generateJWT(env) {
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claimSet = btoa(JSON.stringify({
        iss: env.GOOGLE_DRIVE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
    }));

    const unsignedToken = `${header}.${claimSet}`;
    const privateKey = env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n');

    const signature = crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(unsignedToken)
    );

    return `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

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

router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
    fetch: (request, env, ctx) => router.handle(request, env, ctx)
};
