window.ARQUICRAFT_CONFIG = {
  API_BASE_URL: ""
};

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  window.ARQUICRAFT_CONFIG.API_BASE_URL = "";
} else {
  const origin = window.location.origin;
  if (origin.includes("netlify.app")) {
    window.ARQUICRAFT_CONFIG.API_BASE_URL = "https://tu-backend.onrender.com";
  } else if (origin.includes("render.com")) {
    window.ARQUICRAFT_CONFIG.API_BASE_URL = "";
  }
}
