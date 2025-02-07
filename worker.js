import { Router } from 'itty-router';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

// Configura Google Drive
const auth = new GoogleAuth({
    credentials: {
        type: GOOGLE_DRIVE_TYPE,
        project_id: GOOGLE_DRIVE_PROJECT_ID,
        private_key_id: GOOGLE_DRIVE_PRIVATE_KEY_ID,
        private_key: GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        auth_uri: GOOGLE_DRIVE_AUTH_URI,
        token_uri: GOOGLE_DRIVE_TOKEN_URI,
        auth_provider_x509_cert_url: GOOGLE_DRIVE_AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: GOOGLE_DRIVE_CLIENT_X509_CERT_URL
    },
    scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

// Crea un router para manejar rutas
const router = Router();

// Endpoint para subir archivos
router.post('/upload', async (request) => {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');

        const fileLinks = await Promise.all(
            files.map(async (file) => {
                const buffer = await file.arrayBuffer();
                const response = await drive.files.create({
                    requestBody: {
                        name: file.name,
                        mimeType: file.type
                    },
                    media: {
                        mimeType: file.type,
                        body: Buffer.from(buffer)
                    }
                });

                const fileId = response.data.id;
                await drive.permissions.create({
                    fileId: fileId,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone'
                    }
                });

                const result = await drive.files.get({
                    fileId: fileId,
                    fields: 'webViewLink, webContentLink'
                });

                return result.data.webContentLink;
            })
        );

        return new Response(JSON.stringify({ links: fileLinks }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

// Maneja todas las demás rutas
router.all('*', () => new Response('Not Found', { status: 404 }));

// Exporta el Worker
export default {
    fetch: (request, env, ctx) => router.handle(request, env, ctx)
};