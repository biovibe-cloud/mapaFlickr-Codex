let locations = [
  {
    id: "granada",
    name: "Granada, Espana",
    photos: [
      photo("Espana Portugal 0410", "2018-04-23", localPhoto("2018_04 Espa\u00f1a Portugal 0410.jpg"), 37.176315, -3.598236)
    ]
  },
  {
    id: "pasto",
    name: "Pasto, Colombia",
    photos: [
      photo("Vacaciones Pasto 0756", "2019-01-06", localPhoto("2019_01 Vacaciones Pasto 0756.jpg"), 1.227511, -77.285469)
    ]
  },
  {
    id: "singapore",
    name: "Singapur",
    photos: [
      photo("S E Asia 054", "2019-03-05T07:02:44", localPhoto("2019_03 S E Asia 054.jpg"), 1.289473, 103.842704),
      photo("S E Asia 055", "2019-03-05T07:03:29", localPhoto("2019_03 S E Asia 055.jpg"), 1.289486, 103.842697),
      photo("S E Asia 079", "2019-03-05T23:18:00", localPhoto("2019_03 S E Asia 079.jpg"), 1.282364, 103.858455),
      photo("S E Asia 266", "2019-03-09T00:15:31", localPhoto("2019_03 S E Asia 266.jpg"), 1.282079, 103.844649),
      photo("S E Asia 267", "2019-03-09T00:15:46", localPhoto("2019_03 S E Asia 267.jpg"), 1.282079, 103.844649),
      photo("S E Asia 269", "2019-03-09T03:15:29", localPhoto("2019_03 S E Asia 269.jpg"), 1.280084, 103.855475)
    ]
  }
];

const mapCanvas = document.querySelector("#mapCanvas");
const ribbonStrip = document.querySelector("#ribbonStrip");
const locationName = document.querySelector("#locationName");
const photoCount = document.querySelector("#photoCount");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxTitle = document.querySelector("#lightboxTitle");
const lightboxDate = document.querySelector("#lightboxDate");
const prevPhotoButton = document.querySelector("#prevPhoto");
const nextPhotoButton = document.querySelector("#nextPhoto");
const ribbonSortButtons = document.querySelectorAll("[data-ribbon-sort]");
const flickrForm = document.querySelector("#flickrForm");
const albumInput = document.querySelector("#albumInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const sourceStatus = document.querySelector("#sourceStatus");

let selectedLocation = locations[0];
let selectedMarker = null;
let activePhotoIndex = 0;
let ribbonSortMode = localStorage.getItem("mapaFlickr.ribbonSortMode") || "nearby";
const mapMarkers = new Map();
const urlParams = new URLSearchParams(window.location.search);
const storageKeys = {
  albumId: "mapaFlickr.albumId",
  apiKey: "mapaFlickr.apiKey"
};

albumInput.value = urlParams.get("albumId") || localStorage.getItem(storageKeys.albumId) || "";
apiKeyInput.value = urlParams.get("apiKey") || localStorage.getItem(storageKeys.apiKey) || "";

const map = L.map(mapCanvas, {
  worldCopyJump: true,
  zoomControl: false,
  attributionControl: true,
  minZoom: 2,
  maxZoom: 16,
  zoomSnap: 0.25
});

L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 20
}).addTo(map);

setWorldView();

function photo(title, date, src, lat, lng) {
  return { title, date, src, lat, lng };
}

function localPhoto(fileName) {
  return `Fotos ejemplo/${encodeURIComponent(fileName)}`;
}

function sortedPhotos(location) {
  return [...location.photos].sort((a, b) => dateValue(a.date) - dateValue(b.date)).slice(0, 6);
}

function allSortedPhotos(location) {
  return [...location.photos].sort((a, b) => dateValue(a.date) - dateValue(b.date));
}

function ribbonPhotos() {
  const activePhoto = allSortedPhotos(selectedLocation)[activePhotoIndex];
  if (!activePhoto) return [];

  const photos = locations
    .flatMap((location) =>
      allSortedPhotos(location).map((item, photoIndex) => ({
        item,
        location,
        photoIndex,
        geoDistance: geoDistanceKm(activePhoto, item),
        dateDistance: Math.abs(dateValue(activePhoto.date) - dateValue(item.date))
      }))
    );

  if (ribbonSortMode === "date") {
    return photos.sort((a, b) => {
      if (a.dateDistance !== b.dateDistance) return a.dateDistance - b.dateDistance;
      return a.item.title.localeCompare(b.item.title, "es", { numeric: true });
    });
  }

  if (ribbonSortMode === "name") {
    return photosByNameNearActive(photos, activePhoto);
  }

  return photos.sort((a, b) => {
      if (a.geoDistance !== b.geoDistance) return a.geoDistance - b.geoDistance;
      return a.item.title.localeCompare(b.item.title, "es", { numeric: true });
    });
}

function renderMarkers() {
  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers.clear();

  locations.forEach((location) => {
    const photos = allSortedPhotos(location);
    const item = photos[0];
    const markerKey = locationMarkerKey(location);
    const center = locationCenter(location);
    const marker = L.marker([center.lat, center.lng], {
      icon: markerIcon(markerKey === activeMarkerKey()),
      keyboard: true,
      title: location.name,
      alt: `Abrir ${photos.length} foto${photos.length === 1 ? "" : "s"} en ${location.name}`
    }).addTo(map);

    marker.bindTooltip(thumbnailTooltip(location, item, photos.length), {
      className: "marker-photo-tooltip",
      direction: "top",
      offset: [0, -7],
      opacity: 1,
      sticky: true
    });
    marker.on("click", () => {
      selectLocation(location, 0);
      openPhoto(location, 0);
    });

    if (markerKey === activeMarkerKey()) selectedMarker = marker;
    mapMarkers.set(markerKey, marker);
  });
}

function renderRibbon() {
  const photos = ribbonPhotos().slice(0, 6);

  const selectedPhoto = allSortedPhotos(selectedLocation)[activePhotoIndex];
  locationName.textContent = selectedPhoto?.title || selectedLocation.name;
  photoCount.textContent = ribbonStatusText(photos.length);
  ribbonStrip.innerHTML = "";

  photos.forEach(({ item, location, photoIndex }) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.innerHTML = `
      <img src="${item.src}" alt="${item.title}" loading="lazy">
      <time datetime="${item.date}">${item.title}</time>
    `;
    tile.addEventListener("click", () => {
      selectLocation(location, photoIndex);
      openPhoto(location, photoIndex);
    });
    ribbonStrip.appendChild(tile);
  });

  updateRibbonSortButtons();
}

function selectLocation(location, photoIndex = 0) {
  selectedLocation = location;
  activePhotoIndex = photoIndex;
  updateSelectedMarker();
  renderRibbon();
}

function thumbnailTooltip(location, item, photoTotal = 1) {
  return `
    <div class="marker-tooltip-card">
      <img src="${item.src}" alt="">
      <span>${item.title}${photoTotal > 1 ? ` + ${photoTotal - 1}` : ""} | ${location.name}</span>
    </div>
  `;
}

function openPhoto(location, photoIndex = 0) {
  const photos = allSortedPhotos(location);
  activePhotoIndex = clamp(photoIndex, 0, photos.length - 1);
  const item = photos[activePhotoIndex];
  const wasAlreadyOpen = lightbox.open;

  lightboxImage.src = item.src;
  lightboxImage.alt = `${item.title}, ${location.name}`;
  lightboxTitle.textContent = `${item.title} - ${location.name}`;
  lightboxDate.textContent = `${activePhotoIndex + 1}/${photos.length} | ${formatDate(item.date)}`;
  updateGalleryButtons(photos.length);
  updateSelectedMarker();
  renderRibbon();

  if (!wasAlreadyOpen) {
    lightbox.classList.remove("is-expanded");
    lightbox.showModal();
  }
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(normalizeDate(date)));
}

function dateValue(date) {
  return new Date(normalizeDate(date)).getTime();
}

function normalizeDate(date) {
  if (!date) return new Date().toISOString();
  if (date.length === 10) return `${date}T00:00:00`;
  return date.replace(" ", "T");
}

function markerIcon(isSelected = false) {
  return L.divIcon({
    className: `travel-marker${isSelected ? " is-selected" : ""}`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function geoDistanceKm(a, b) {
  const earthRadiusKm = 6371;
  const latDelta = degreesToRadians(b.lat - a.lat);
  const lngDelta = degreesToRadians(b.lng - a.lng);
  const startLat = degreesToRadians(a.lat);
  const endLat = degreesToRadians(b.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function photosByNameNearActive(photos, activePhoto) {
  const sortedByName = [...photos].sort((a, b) => a.item.title.localeCompare(b.item.title, "es", { numeric: true }));
  const activeIndex = sortedByName.findIndex((entry) => entry.item === activePhoto);

  return sortedByName
    .map((entry, index) => ({
      ...entry,
      nameDistance: activeIndex === -1 ? index : Math.abs(index - activeIndex)
    }))
    .sort((a, b) => {
      if (a.nameDistance !== b.nameDistance) return a.nameDistance - b.nameDistance;
      return a.item.title.localeCompare(b.item.title, "es", { numeric: true });
    });
}

function updateGalleryButtons(photoTotal) {
  prevPhotoButton.disabled = photoTotal <= 1;
  nextPhotoButton.disabled = photoTotal <= 1;
}

function changePhoto(direction) {
  const photos = allSortedPhotos(selectedLocation);
  const nextIndex = (activePhotoIndex + direction + photos.length) % photos.length;
  openPhoto(selectedLocation, nextIndex);
}

function updateSelectedMarker() {
  const selectedKey = activeMarkerKey();
  mapMarkers.forEach((marker, id) => {
    marker.setIcon(markerIcon(id === selectedKey));
    if (id === selectedKey) selectedMarker = marker;
  });
}

function locationMarkerKey(location) {
  return location.id;
}

function activeMarkerKey() {
  return locationMarkerKey(selectedLocation);
}

function setWorldView() {
  map.setView([18, 10], 2);
}

document.querySelector("#closeLightbox").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});
lightboxImage.addEventListener("click", () => {
  lightbox.classList.toggle("is-expanded");
});
prevPhotoButton.addEventListener("click", () => changePhoto(-1));
nextPhotoButton.addEventListener("click", () => changePhoto(1));
document.addEventListener("keydown", (event) => {
  if (!lightbox.open) return;
  if (event.key === "ArrowLeft") changePhoto(-1);
  if (event.key === "ArrowRight") changePhoto(1);
});

document.querySelectorAll("[data-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.zoom;
    if (action === "in") map.zoomIn(1);
    if (action === "out") map.zoomOut(1);
    if (action === "reset") setWorldView();
  });
});

ribbonSortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    ribbonSortMode = button.dataset.ribbonSort;
    localStorage.setItem("mapaFlickr.ribbonSortMode", ribbonSortMode);
    renderRibbon();
  });
});

flickrForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadFlickrAlbum();
});

renderMarkers();
renderRibbon();
loadFlickrAlbum({ silent: true });

function replaceLocations(nextLocations) {
  locations = nextLocations;
  selectedLocation = locations[0];
  activePhotoIndex = 0;
  renderMarkers();
  renderRibbon();
  fitMapToPhotos();
}

function fitMapToPhotos() {
  const points = locations.map((location) => {
    const center = locationCenter(location);
    return [center.lat, center.lng];
  });
  if (points.length === 1) {
    map.setView(points[0], 12);
    return;
  }
  map.fitBounds(L.latLngBounds(points), { padding: [38, 38], maxZoom: 12 });
}

function locationCenter(location) {
  const center = location.photos.reduce(
    (acc, item) => ({ lat: acc.lat + item.lat, lng: acc.lng + item.lng }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: center.lat / location.photos.length,
    lng: center.lng / location.photos.length
  };
}

function ribbonStatusText(photoTotal) {
  const label = `${photoTotal} imagen${photoTotal === 1 ? "" : "es"}`;

  if (ribbonSortMode === "date") return `${label} con fechas cercanas a la seleccion`;
  if (ribbonSortMode === "name") return `${label} con nombres cercanos a la seleccion`;
  return `${label} mas cercanas a la seleccion`;
}

function updateRibbonSortButtons() {
  ribbonSortButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.ribbonSort === ribbonSortMode);
  });
}

async function loadFlickrAlbum({ silent = false } = {}) {
  const params = new URLSearchParams();
  const rawAlbumId = albumInput.value.trim();
  const albumId = normalizeAlbumId(rawAlbumId);
  const apiKey = apiKeyInput.value.trim();
  const hasCredentials = Boolean(albumId || apiKey);
  const quiet = silent && !hasCredentials;

  if (!albumId && !apiKey) return;

  if (!albumId || !apiKey) {
    if (!quiet) setSourceStatus("Falta el ID del album o la API key");
    return;
  }

  if (albumId !== rawAlbumId) albumInput.value = albumId;
  if (albumId) params.set("albumId", albumId);
  if (apiKey) params.set("apiKey", apiKey);
  params.set("cacheBust", String(Date.now()));
  saveFlickrSettings(albumId, apiKey);

  if (!quiet) setSourceStatus("Leyendo Flickr...");

  try {
    const payload = await fetchFlickrAlbum(params, apiKey, albumId);

    if (!payload.photos?.length) {
      setSourceStatus("El album no tiene fotos con ubicacion publica");
      return;
    }

    replaceLocations(groupPhotosByPlace(payload.photos));
    setSourceStatus(`${payload.located}/${payload.total} fotos ubicadas de ${payload.title}`);
  } catch (error) {
    if (!quiet) setSourceStatus(error.message || "No se pudo conectar con Flickr");
  }
}

async function fetchFlickrAlbum(params, apiKey, albumId) {
  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch(`/api/flickr-album?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (response.ok) return payload;
      throw new Error(payload.error || "No se pudo leer Flickr");
    } catch {
      // If the local server is not running, try Flickr directly below.
    }
  }

  const firstPage = await fetchFlickrPhotoPage(apiKey, albumId, 1);
  const pages = Number(firstPage.photoset?.pages || 1);
  const photos = [...(firstPage.photoset?.photo || [])];

  for (let page = 2; page <= pages; page += 1) {
    setSourceStatus(`Leyendo Flickr... pagina ${page}/${pages}`);
    const payload = await fetchFlickrPhotoPage(apiKey, albumId, page);
    photos.push(...(payload.photoset?.photo || []));
  }

  return normalizeFlickrPayload(
    {
      photoset: {
        title: firstPage.photoset?.title,
        total: firstPage.photoset?.total,
        photo: photos
      }
    },
    albumId
  );
}

async function fetchFlickrPhotoPage(apiKey, albumId, page) {
  const flickrParams = new URLSearchParams({
    method: "flickr.photosets.getPhotos",
    api_key: apiKey,
    photoset_id: albumId,
    extras: "geo,date_taken,url_sq,url_t,url_s,url_m,url_l,url_o,description",
    format: "json",
    nojsoncallback: "1",
    per_page: "500",
    page: String(page),
    cache_bust: String(Date.now())
  });

  const response = await fetch(`https://www.flickr.com/services/rest/?${flickrParams.toString()}`, {
    cache: "no-store"
  });
  const payload = await response.json();

  if (!response.ok || payload.stat !== "ok") {
    throw new Error(payload.message || "No se pudo leer Flickr");
  }

  return payload;
}

function normalizeFlickrPayload(payload, albumId) {
  const photos = (payload.photoset?.photo || [])
    .map((item) => {
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
        lat,
        lng
      };
    })
    .filter(Boolean);

  return {
    albumId,
    title: payload.photoset?.title || "Album de Flickr",
    total: Number(payload.photoset?.total || photos.length),
    located: photos.length,
    photos
  };
}

function flickrImageUrl(item) {
  const directUrl = item.url_l || item.url_m || item.url_s || item.url_t || item.url_sq || item.url_o;

  if (directUrl) return directUrl.replace(/^http:/, "https:");
  if (!item.server || !item.id || !item.secret) return "";

  return `https://live.staticflickr.com/${item.server}/${item.id}_${item.secret}_z.jpg`;
}

function setSourceStatus(message) {
  sourceStatus.textContent = message;
}

function saveFlickrSettings(albumId, apiKey) {
  localStorage.setItem(storageKeys.albumId, albumId);
  localStorage.setItem(storageKeys.apiKey, apiKey);
}

function normalizeAlbumId(value) {
  const match = value.match(/\d{8,}/);
  return match ? match[0] : value;
}

function groupPhotosByPlace(items) {
  const groups = new Map();

  items.forEach((item) => {
    const key = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: `place-${groups.size + 1}`,
        name: `Ubicacion ${groups.size + 1}`,
        photos: []
      });
    }
    groups.get(key).photos.push(item);
  });

  return [...groups.values()].map((location) => {
    const center = location.photos.reduce(
      (acc, item) => ({ lat: acc.lat + item.lat, lng: acc.lng + item.lng }),
      { lat: 0, lng: 0 }
    );
    const lat = center.lat / location.photos.length;
    const lng = center.lng / location.photos.length;
    return {
      ...location,
      name: `${location.name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    };
  });
}
