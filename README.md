# mapaFlickr

mapaFlickr es una copia de `Mapadeviajes` adaptada para cargar fotos geolocalizadas desde un album de Flickr.

## Ejecutar localmente

Puedes abrir `index.html` directamente y pegar el ID del album y la API key en la pantalla.

Si tienes Node.js instalado, tambien puedes levantar el servidor local:

```bash
npm start
```

Luego abre:

```text
http://localhost:4173
```

Si PowerShell dice que `npm` no existe, instala Node.js desde `https://nodejs.org/` o usa la opcion de abrir `index.html` directamente.

## Configurar Flickr

Necesitas una API key de Flickr y el ID del album/photoset. Puedes usarlos de dos formas:

### Opcion recomendada para GitHub Pages y blogs

Abre `index.html` o la URL publicada en GitHub Pages, pega el ID del album y la API key en los campos de la app y pulsa `Cargar album`.

La app guarda esos datos en el navegador de cada usuario con `localStorage`, por lo que cada persona puede usar su propio album sin modificar el codigo.

Tambien puedes compartir o incrustar una URL con parametros:

```text
https://tu-usuario.github.io/tu-repo/?albumId=TU_ALBUM_ID&apiKey=TU_API_KEY
```

Para un blog, puedes usar un iframe:

```html
<iframe
  src="https://tu-usuario.github.io/tu-repo/?albumId=TU_ALBUM_ID&apiKey=TU_API_KEY"
  width="100%"
  height="720"
  style="border:0;"
  loading="lazy"
></iframe>
```

### Opcion con servidor Node.js

```powershell
$env:FLICKR_API_KEY="tu_api_key"
$env:FLICKR_ALBUM_ID="tu_album_id"
npm start
```

Tambien puedes abrir la app local con parametros:

```text
http://localhost:4173/?albumId=TU_ALBUM_ID&apiKey=TU_API_KEY
```

El servidor expone `/api/flickr-album`, consulta `flickr.photosets.getPhotos` y devuelve solamente las fotos con latitud y longitud publicas. Para que aparezcan en el mapa, las fotos del album deben tener geolocalizacion visible en Flickr.

La app fuerza una lectura fresca de Flickr en cada carga y recorre todas las paginas del album. Si agregas fotos nuevas y no aparecen, revisa en Flickr que esas fotos tengan ubicacion y que esa ubicacion sea visible publicamente.

## Desplegar en Railway

Railway detecta `package.json` y ejecuta:

```bash
npm start
```

Define estas variables de entorno en Railway:

```text
FLICKR_API_KEY
FLICKR_ALBUM_ID
```

El servidor usa `PORT` automaticamente cuando Railway lo define.
