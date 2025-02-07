require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs'); 
const fsp = require('fs').promises; 

const app = express();
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// Habilitar CORS 
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://tatapiriri.netlify.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// Configura Drive
const auth = new google.auth.GoogleAuth({
    credentials: {
        type: process.env.GOOGLE_DRIVE_TYPE,
        project_id: process.env.GOOGLE_DRIVE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_DRIVE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
        auth_uri: process.env.GOOGLE_DRIVE_AUTH_URI,
        token_uri: process.env.GOOGLE_DRIVE_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.GOOGLE_DRIVE_AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.GOOGLE_DRIVE_CLIENT_X509_CERT_URL
    },
    scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

// subir archivos
app.post('/upload', upload.array('files'), async (req, res) => {
    try { 

        if (!req.files || req.files.length === 0) {
            console.error('No se recibieron archivos en la solicitud');
            return res.status(400).json({ error: 'No se recibieron archivos' });
        }
        const fileLinks = await Promise.all(
            req.files.map(async (file) => {
                try {
                    // Crear el archivo en Google Drive
                    const response = await drive.files.create({
                        requestBody: {
                            name: file.originalname,
                            mimeType: file.mimetype
                        },
                        media: {
                            mimeType: file.mimetype,
                            body: fs.createReadStream(file.path) 
                        }
                    });

                    const fileId = response.data.id;
                    console.log(`Archivo subido con ID: ${fileId}`); 
                    // Configurar permisos para el archivo
                    await drive.permissions.create({
                        fileId: fileId,
                        requestBody: {
                            role: 'reader',
                            type: 'anyone'
                        }
                    });

                    // Obtener el enlace del archivo
                    const result = await drive.files.get({
                        fileId: fileId,
                        fields: 'webViewLink, webContentLink'
                    });

                    console.log(`Enlace generado para el archivo: ${result.data.webContentLink}`); 

                    // Eliminar el archivo temporal después de subirlo
                    await fsp.unlink(file.path); 

                    return result.data.webContentLink;
                } catch (error) {
                    console.error(`Error al procesar el archivo ${file.originalname}:`, error.message);
                    throw error;
                }
            })
        );

        console.log('Todos los archivos han sido procesados correctamente');
        res.json({ links: fileLinks });
    } catch (error) {
        console.error('Error al subir archivos:', error.message); 
        console.error('Detalles del error:', error); 
        res.status(500).json({ error: 'Hubo un error al subir los archivos' });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});