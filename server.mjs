import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const flickrApiKey = process.env.FLICKR_API_KEY || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

function isInsideRoot(filePath) {
  const relativePath = relative(root, filePath);
  return relativePath && !relativePath.startsWith("..") && !resolve(relativePath).startsWith("\\\\");
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);

    if (pathname === "/api/flickr-album") {
      await handleFlickrAlbum(url, response);
      return;
    }

    const filePath = resolve(join(root, pathname));

    if (!isInsideRoot(filePath)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    const contentType = contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store, max-age=0"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`mapaFlickr running on http://${host}:${port}`);
});

async function handleFlickrAlbum(url, response) {
  try {
    const apiKey = url.searchParams.get("apiKey") || flickrApiKey;
    const albumId = url.searchParams.get("albumId") || "";
    const requestedLimit = Number(url.searchParams.get("limit") || 500);
    const limit = Math.min(Math.max(requestedLimit, 1), 500);

    if (!apiKey || !albumId) {
      sendJson(response, 400, {
        error: "Falta apiKey o albumId. El album debe enviarse explicitamente en cada carga."
      });
      return;
    }

    const payload = await fetchAllFlickrPhotos({ apiKey, albumId, limit });
    const photos = await normalizeFlickrPhotos(payload.photos, apiKey);

    sendJson(response, 200, {
      albumId,
      title: payload.title || "Album de Flickr",
      total: payload.total,
      located: photos.length,
      photos
    });
  } catch (error) {
    sendJson(response, error.status || 502, {
      error: error.message || "No se pudo conectar con Flickr."
    });
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0"
  });
  response.end(JSON.stringify(body));
}

async function fetchAllFlickrPhotos({ apiKey, albumId, limit }) {
  const firstPage = await fetchFlickrPhotoPage({ apiKey, albumId, limit, page: 1 });
  const pages = Number(firstPage.photoset?.pages || 1);
  const photos = [...(firstPage.photoset?.photo || [])];

  for (let page = 2; page <= pages; page += 1) {
    const payload = await fetchFlickrPhotoPage({ apiKey, albumId, limit, page });
    photos.push(...(payload.photoset?.photo || []));
  }

  return {
    title: firstPage.photoset?.title,
    total: Number(firstPage.photoset?.total || photos.length),
    photos
  };
}

async function fetchFlickrPhotoPage({ apiKey, albumId, limit, page }) {
  const flickrUrl = new URL("https://www.flickr.com/services/rest/");
  flickrUrl.search = new URLSearchParams({
    method: "flickr.photosets.getPhotos",
    api_key: apiKey,
    photoset_id: albumId,
    extras: "geo,date_taken,url_sq,url_t,url_s,url_m,url_l,url_o,description",
    format: "json",
    nojsoncallback: "1",
    per_page: String(limit),
    page: String(page),
    cache_bust: String(Date.now())
  }).toString();

  const flickrResponse = await fetch(flickrUrl, { cache: "no-store" });
  const payload = await flickrResponse.json();

  if (!flickrResponse.ok || payload.stat !== "ok") {
    const error = new Error(payload.message || "No se pudo leer el album de Flickr.");
    error.status = flickrResponse.ok ? 502 : flickrResponse.status;
    throw error;
  }

  return payload;
}

async function normalizeFlickrPhotos(items, apiKey) {
  const photosWithLocations = await fillMissingFlickrLocations(items, apiKey);

  return photosWithLocations
    .map((item, index) => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      const src = flickrImageUrl(item);

      if (!item.latitude || !item.longitude || !Number.isFinite(lat) || !Number.isFinite(lng) || !src) {
        return null;
      }

      return {
        id: item.id,
        title: item.title || `Foto ${item.id}`,
        date: item.datetaken || new Date().toISOString(),
        src,
        fallbackSrc: flickrStaticImageUrl(item),
        lat,
        lng,
        albumOrder: index
      };
    })
    .filter(Boolean);
}

function flickrImageUrl(item) {
  const directUrl = item.url_l || item.url_m || item.url_s || item.url_t || item.url_sq || item.url_o;

  if (directUrl) return directUrl.replace(/^http:/, "https:");
  return flickrStaticImageUrl(item);
}

function flickrStaticImageUrl(item) {
  if (!item.server || !item.id || !item.secret) return "";

  return `https://live.staticflickr.com/${item.server}/${item.id}_${item.secret}_z.jpg`;
}

async function fillMissingFlickrLocations(items, apiKey) {
  const photos = [...items];
  const missingGeo = photos.filter((item) => !hasFlickrGeo(item));

  if (!missingGeo.length || !apiKey) return photos;

  const batchSize = 8;
  for (let index = 0; index < missingGeo.length; index += batchSize) {
    const batch = missingGeo.slice(index, index + batchSize);
    const locations = await Promise.all(batch.map((item) => fetchFlickrPhotoLocation(item, apiKey)));

    locations.forEach((location, batchIndex) => {
      if (!location) return;
      Object.assign(batch[batchIndex], location);
    });
  }

  return photos;
}

function hasFlickrGeo(item) {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return Boolean(item.latitude && item.longitude && Number.isFinite(lat) && Number.isFinite(lng));
}

async function fetchFlickrPhotoLocation(item, apiKey) {
  if (!item.id) return null;

  const flickrUrl = new URL("https://www.flickr.com/services/rest/");
  flickrUrl.search = new URLSearchParams({
    method: "flickr.photos.geo.getLocation",
    api_key: apiKey,
    photo_id: item.id,
    format: "json",
    nojsoncallback: "1",
    cache_bust: String(Date.now())
  }).toString();

  try {
    const flickrResponse = await fetch(flickrUrl, { cache: "no-store" });
    const payload = await flickrResponse.json();
    const location = payload.photo?.location;
    const lat = Number(location?.latitude);
    const lng = Number(location?.longitude);

    if (!flickrResponse.ok || payload.stat !== "ok" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      latitude: String(lat),
      longitude: String(lng)
    };
  } catch {
    return null;
  }
}
