# ARQUICRAFT

Aplicación web con frontend estático y backend Express para manejar login admin, ranking y persistencia del torneo.

## Variables de entorno

Copia el archivo `.env.example` a `.env` y completa los valores.

```bash
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=arquicraft
JWT_SECRET=tu-secreto-muy-largo
ADMIN_USER=admin
ADMIN_PASS=admin123
```

## Ejecutar localmente

```bash
npm install
npm start
```

## Despliegue en Render

1. Conecta este repositorio a Render.
2. Crea un servicio Web con el archivo `render.yaml`.
3. Define `MONGO_URI` con tu base de datos MongoDB Atlas.
4. Publica el servicio.

La app sirve el frontend y el backend desde el mismo servicio.

## Frontend en Netlify

Si quieres separar el frontend en Netlify, usa la variable `API_BASE_URL` en `public/config.js` con la URL del backend de Render.

Ejemplo:

```js
window.ARQUICRAFT_CONFIG = {
  API_BASE_URL: "https://tu-backend.onrender.com"
};
```
