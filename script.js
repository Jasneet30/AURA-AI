/* AURA AI — camera, face validation, skin classification and feedback */
"use strict";

const firebaseConfig = {
  apiKey: "AIzaSyCdlyVP4wM7spDd5bcU6PbMTszn9323pas",
  authDomain: "aura-ai-eb547.firebaseapp.com",
  projectId: "aura-ai-eb547",
  storageBucket: "aura-ai-eb547.firebasestorage.app",
  messagingSenderId: "987517360005",
  appId: "1:987517360005:web:fc4c424e827ae6dc0e96ec"
};

const MODEL_URL = "https://teachablemachine.withgoogle.com/models/VaQJIxQdU/";
const MODEL_VERSION = "V2-three-classes";
const MIN_CLASS_CONFIDENCE = 0.55;
const MAX_CAPTURE_PIXELS = 1280;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraFrame = document.getElementById("cameraFrame");
const cameraGuide = document.getElementById("cameraGuide");
const startCameraButton = document.getElementById("startCamera");
const captureButton = document.getElementById("capture");
const switchCameraButton = document.getElementById("switchCamera");
const retakePhotoButton = document.getElementById("retakePhoto");
const result = document.getElementById("result");
const cameraInstruction = document.getElementById("cameraInstruction");

let skinModel = null;
let faceModel = null;
let cameraStream = null;
let facingMode = "user";
let busy = false;
let firebaseDb = null;
let firebaseReady = false;
let currentPrediction = null;
let lastPhotoDataUrl = null;

function setStatus(message, type = "info") {
  result.setAttribute("aria-busy", type === "loading" ? "true" : "false");
  result.innerHTML = `<div class="status-card status-${type}" role="status">${message}</div>`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function normalizeConcern(label) {
  const value = String(label || "").trim().toLowerCase();
  if (value.includes("acne") || value.includes("blemish")) return "Acne";
  if (value.includes("pigment") || value.includes("dark spot") || value.includes("uneven tone")) return "Pigmentation";
  if (value.includes("clear") || value.includes("normal")) return "Clear Skin";
  return null;
}

async function initializeFirebase() {
  try {
    if (!window.firebase) return;
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    firebaseDb = firebase.firestore();
    firebaseReady = true;
    console.info("AURA AI: Firebase ready");
  } catch (error) {
    firebaseReady = false;
    console.warn("Firebase unavailable; scans still work, feedback cannot be saved.", error);
  }
}

async function loadSkinModel() {
  if (!window.tmImage) throw new Error("The Teachable Machine library did not load. Check your internet connection and refresh.");
  skinModel = await tmImage.load(`${MODEL_URL}model.json`, `${MODEL_URL}metadata.json`);
  console.info("AURA AI: skin model loaded", skinModel.getClassLabels?.());
}

async function loadFaceModel() {
  if (!window.tf || !window.blazeface) throw new Error("The face-detection library did not load. Check your internet connection and refresh.");
  await tf.ready();
  faceModel = await blazeface.load();
  console.info("AURA AI: face detector loaded");
}

async function initializeApp() {
  startCameraButton.disabled = true;
  setStatus("Preparing the AI models. This may take a moment on first load…", "loading");
  try {
    await Promise.all([loadSkinModel(), loadFaceModel(), initializeFirebase()]);
    startCameraButton.disabled = false;
    setStatus("AURA AI is ready. Open the camera when you’re ready.", "success");
  } catch (error) {
    console.error("Initialization failed:", error);
    startCameraButton.disabled = false;
    setStatus(`${escapeHTML(error.message || "AURA AI could not load.")} You can refresh the page and try again.`, "error");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  video.srcObject = null;
}

function setCameraUI({ preview = false, photo = false, controls = false } = {}) {
  video.hidden = !preview;
  cameraGuide.hidden = !preview;
  canvas.hidden = !photo;
  captureButton.hidden = !preview;
  switchCameraButton.hidden = !preview;
  retakePhotoButton.hidden = !photo;
  startCameraButton.hidden = preview || photo;
  captureButton.disabled = !controls || busy;
}

async function openCamera() {
  if (busy) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("This browser cannot access a camera. Open AURA AI in a modern browser over HTTPS or localhost.", "error");
    return;
  }
  stopCamera();
  startCameraButton.disabled = true;
  setStatus("Opening camera…", "loading");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
        aspectRatio: { ideal: 4 / 3 }
      }
    });
    video.srcObject = cameraStream;
    await new Promise((resolve, reject) => {
      if (video.readyState >= 2 && video.videoWidth) return resolve();
      const timeout = setTimeout(() => reject(new Error("Camera preview took too long to start. Please try again.")), 10000);
      video.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
      video.onerror = () => { clearTimeout(timeout); reject(new Error("The camera preview could not start.")); };
    });
    await video.play();
    const ratio = `${video.videoWidth} / ${video.videoHeight}`;
    cameraFrame.style.aspectRatio = ratio;
    canvas.style.aspectRatio = ratio;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    setCameraUI({ preview: true, photo: false, controls: true });
    result.innerHTML = "";
    cameraInstruction.textContent = "Keep your whole face inside the frame, in good lighting, then take the photo.";
  } catch (error) {
    stopCamera();
    console.error("Camera could not open:", error);
    setCameraUI();
    setStatus(`${escapeHTML(cameraErrorMessage(error))}`, "error");
  } finally {
    startCameraButton.disabled = false;
  }
}

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") return "Camera permission was denied. Allow camera access in your browser settings, then click Open Camera again.";
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "No camera was found on this device. Connect a camera or try another device.";
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "The camera may be in use by another app. Close other camera apps and try again.";
  return error?.message || "Unable to access the camera. Check permissions and try again.";
}

async function switchCamera() {
  if (busy) return;
  facingMode = facingMode === "user" ? "environment" : "user";
  await openCamera();
}

function captureFrame() {
  if (!cameraStream || !video.videoWidth || !video.videoHeight) throw new Error("The camera is not ready yet. Wait for the preview, then try again.");
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const scale = Math.min(1, MAX_CAPTURE_PIXELS / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  canvas.width = width;
  canvas.height = height;
  cameraFrame.style.aspectRatio = `${width} / ${height}`;
  canvas.style.aspectRatio = `${width} / ${height}`;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not prepare the photo. Please refresh and try again.");
  context.clearRect(0, 0, width, height);
  // Mirror the captured image so it matches the mirrored selfie preview.
  if (facingMode === "user") {
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.restore();
  } else {
    context.drawImage(video, 0, 0, width, height);
  }
  lastPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.82);
}

function basicPhotoQualityCheck() {
  if (!canvas.width || !canvas.height) return "The photo is empty. Please take another photo.";
  if (canvas.width < 240 || canvas.height < 240) return "The photo resolution is too low. Move closer and take another photo.";
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let total = 0;
    const stride = Math.max(4, Math.floor(data.length / 12000 / 4) * 4);
    let samples = 0;
    for (let i = 0; i < data.length; i += stride) {
      total += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      samples++;
    }
    const average = total / Math.max(1, samples);
    if (average < 28) return "This photo looks too dark. Move to brighter, even lighting and retake it.";
    if (average > 248) return "This photo looks overexposed. Avoid direct bright light and retake it.";
  } catch (error) {
    console.warn("Could not check photo brightness:", error);
  }
  return null;
}

async function detectFace() {
  if (!faceModel) throw new Error("Face detection is unavailable because its model did not load. Refresh the page and try again.");
  const predictions = await faceModel.estimateFaces(canvas, false);
  return Array.isArray(predictions) && predictions.length > 0;
}

function showRetryMessage(title, message) {
  result.setAttribute("aria-busy", "false");
  result.innerHTML = `
    <div class="face-error">
      <div class="face-error-icon" aria-hidden="true">📷</div>
      <h2>${escapeHTML(title)}</h2>
      <p>${escapeHTML(message)}</p>
      <button id="retryScan" class="primary-btn" type="button">Retake Photo</button>
    </div>`;
  document.getElementById("retryScan").addEventListener("click", () => openCamera());
  retakePhotoButton.hidden = false;
}

async function takePhoto() {
  if (busy) return;
  busy = true;
  captureButton.disabled = true;
  switchCameraButton.disabled = true;
  setStatus("Capturing your photo…", "loading");
  try {
    captureFrame();
    stopCamera();
    setCameraUI({ photo: true });
    setStatus("Checking photo quality and looking for a face…", "loading");
    await analyzePhoto();
  } catch (error) {
    console.error("Capture/analysis error:", error);
    showRetryMessage("We couldn't process that photo", error.message || "Please retake a clear photo.");
  } finally {
    busy = false;
    captureButton.disabled = false;
    switchCameraButton.disabled = false;
  }
}

async function analyzePhoto() {
  if (!skinModel) throw new Error("The skin-analysis model is not ready. Refresh the page and try again.");
  const qualityMessage = basicPhotoQualityCheck();
  if (qualityMessage) {
    showRetryMessage("Please retake your photo", qualityMessage);
    return;
  }

  setStatus("Checking that the photo contains a face…", "loading");
  let faceFound;
  try {
    faceFound = await withTimeout(detectFace(), 20000, "Face detection took too long. Check your connection and retake the photo.");
  } catch (error) {
    console.error("Face validation failed:", error);
    showRetryMessage("Face check unavailable", error.message || "The face check failed. Refresh and try again.");
    return;
  }
  if (!faceFound) {
    showRetryMessage("Face Not Detected", "We couldn't find a face in this photo. Please photograph your face—not a hand, object, or background—with your whole face visible and try again.");
    return;
  }

  setStatus("Face detected. Analyzing visible skin features…", "loading");
  const predictions = await withTimeout(skinModel.predict(canvas), 30000, "Skin analysis took too long. Please retake the photo and try again.");
  if (!Array.isArray(predictions) || predictions.length === 0) throw new Error("The skin model returned no result. Please try another photo.");
  predictions.sort((a, b) => b.probability - a.probability);
  const top = predictions[0];
  const concern = normalizeConcern(top.className);
  if (!concern) throw new Error(`The model returned an unexpected class (“${top.className}”). Check that your Teachable Machine model has only Clear Skin, Acne, and Pigmentation classes, then reload.`);
  if (!Number.isFinite(top.probability) || top.probability < MIN_CLASS_CONFIDENCE) {
    showRetryMessage("Photo unclear", "AURA AI is not confident enough about this result. Try a closer, sharper photo in soft, even lighting.");
    return;
  }
  currentPrediction = { concern, rawLabel: top.className, confidence: top.probability };
  renderAnalysis(concern, top.probability, predictions);
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

function renderAnalysis(concern, confidence, predictions) {
  const confidencePercent = Math.round(confidence * 100);
  const observationRows = predictions.map(item => {
    const normalized = normalizeConcern(item.className) || item.className;
    return `<div class="observation-row"><strong>${escapeHTML(normalized)}</strong><span>${Math.round(item.probability * 100)}%</span></div>`;
  }).join("");
  result.setAttribute("aria-busy", "false");
  result.innerHTML = `
    <div class="analysis-result">
      <div class="analysis-result-heading"><span class="eyebrow">YOUR AURA INSIGHTS</span><h2>AI Skin Analysis</h2><p>Primary visual category: <strong>${escapeHTML(concern)}</strong></p><p class="confidence-line">Model confidence: <strong>${confidencePercent}%</strong></p></div>
      <div class="observations"><h3>Model observations</h3>${observationRows}</div>
      ${getRecommendation(concern)}
      <div class="feedback-box"><h3>Was this category correct?</h3><p>Your feedback helps us evaluate the prototype; it does not automatically retrain the model.</p>
        <div class="feedback-buttons"><button id="correctBtn" class="secondary-btn" type="button">👍 Yes, correct</button><button id="wrongBtn" class="secondary-btn" type="button">👎 Correct it</button></div><div id="feedbackArea"></div>
      </div>
      <button id="resultRetake" class="primary-btn" type="button">📸 Scan Another Photo</button>
    </div>`;

  document.getElementById("correctBtn").addEventListener("click", async () => {
    await saveFeedback(concern, confidence, true, concern);
  });
  document.getElementById("wrongBtn").addEventListener("click", () => {
    document.getElementById("feedbackArea").innerHTML = `<label for="correctLabel">Choose the best matching category</label><select id="correctLabel"><option value="">Select a category</option><option value="Clear Skin">Clear Skin</option><option value="Acne">Acne</option><option value="Pigmentation">Pigmentation</option></select><button id="submitCorrection" class="primary-btn" type="button">Submit Correction</button>`;
    document.getElementById("submitCorrection").addEventListener("click", async () => {
      const corrected = document.getElementById("correctLabel").value;
      if (!corrected) { document.getElementById("correctLabel").focus(); return; }
      await saveFeedback(concern, confidence, false, corrected);
    });
  });
  document.getElementById("resultRetake").addEventListener("click", () => openCamera());
  retakePhotoButton.hidden = false;
}

async function saveFeedback(prediction, confidence, correct, correctedLabel) {
  const feedbackArea = document.getElementById("feedbackArea");
  const yesButton = document.getElementById("correctBtn");
  const wrongButton = document.getElementById("wrongBtn");
  if (!firebaseReady || !firebaseDb) {
    feedbackArea.innerHTML = `<p class="feedback-error">Feedback could not be saved because Firebase is unavailable. Your scan result is still displayed.</p>`;
    return;
  }
  yesButton.disabled = true;
  wrongButton.disabled = true;
  feedbackArea.innerHTML = `<p role="status">Saving feedback…</p>`;
  try {
    // Deliberately do not store the face image as base64 in Firestore: it can exceed the 1 MiB document limit and is sensitive personal data.
    await firebaseDb.collection("scans").add({
      prediction,
      confidence: Math.round(confidence * 100),
      correct,
      correctedLabel,
      modelVersion: MODEL_VERSION,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    feedbackArea.innerHTML = `<p class="feedback-success">✓ Feedback saved. Thanks for helping evaluate AURA AI.</p>`;
  } catch (error) {
    console.error("Could not save feedback:", error);
    feedbackArea.innerHTML = `<p class="feedback-error">Could not save feedback. Check your internet connection and Firestore rules, then try again.</p>`;
    yesButton.disabled = false;
    wrongButton.disabled = false;
  }
}

function resetForNewPhoto() {
  if (busy) return;
  stopCamera();
  canvas.hidden = true;
  video.hidden = true;
  cameraGuide.hidden = true;
  captureButton.hidden = true;
  switchCameraButton.hidden = true;
  retakePhotoButton.hidden = true;
  startCameraButton.hidden = false;
  startCameraButton.disabled = false;
  result.innerHTML = "";
  cameraInstruction.textContent = "Keep your whole face inside the frame. The photo will be checked before analysis.";
  openCamera();
}

startCameraButton.addEventListener("click", openCamera);
captureButton.addEventListener("click", takePhoto);
switchCameraButton.addEventListener("click", switchCamera);
retakePhotoButton.addEventListener("click", resetForNewPhoto);
window.addEventListener("pagehide", stopCamera);

function getRecommendation(concern) {

    const recommendations = {

        // =====================================
        // ACNE / BLEMISHES
        // =====================================

        "Acne": {

            title: "✨ Acne & Blemish Care",
            subtitle: "A simple routine focused on keeping breakout-prone skin clean, balanced and protected.",

            products: [

                {
                    name: "Minimalist Salicylic + LHA 2% Cleanser",
                    type: "CLEANSER",
                    description: "For acne, breakouts and excess oil.",
                    image: "https://www.reequil.com/cdn/shop/files/Acne_Clarifying_Gel.webp?v=1770666591&width=800",
                    link: "https://beminimalist.co/products/salicylic-lha-2-cleanser"
                },

                {
                    name: "Minimalist Niacinamide 10% Face Serum",
                    type: "SERUM",
                    description: "Designed for acne-prone and oily skin.",
                    image: "https://www.reequil.com/cdn/shop/files/2_e850209b-5067-42b8-9142-a13dfe1a6696.jpg?v=1772696350&width=800",
                    link: "https://beminimalist.co/collections/face-serum"
                },

                {
                    name: "Re'equil Ultra Matte Dry Touch Sunscreen SPF 50",
                    type: "SUNSCREEN",
                    description: "Lightweight, non-comedogenic sun protection.",
                    image: "https://www.reequil.com/cdn/shop/files/new_old.jpg?v=1770667604&width=800",
                    link: "https://www.reequil.com/collections/all/products/ultra-matte-dry-touch-sunscreen-gel-spf-50-pa"
                }

            ]
        },


        // =====================================
        // PIGMENTATION
        // =====================================

        "Pigmentation": {

            title: "✨ Even Tone & Glow",
            subtitle: "Products selected to support a more even-looking complexion and protect skin from further UV exposure.",

            products: [

                {
                    name: "Minimalist Alpha Arbutin 2% Face Serum",
                    type: "BRIGHTENING SERUM",
                    description: "Designed for pigmentation, dark spots and uneven tone.",
                    image: "https://www.reequil.com/cdn/shop/files/2_6e87fbbc-bf98-47c0-a3e0-0e70073a9f91.jpg?v=1771239046&width=800",
                    link: "https://beminimalist.co/products/alpha-arbutin-2"
                },

                {
                    name: "Minimalist Vitamin C 10% Face Serum",
                    type: "GLOW SERUM",
                    description: "Designed for dullness and visible spots.",
                    image: "https://www.reequil.com/cdn/shop/files/2_6e87fbbc-bf98-47c0-a3e0-0e70073a9f91.jpg?v=1771239046&width=800",
                    link: "https://beminimalist.co/collections/face-serum"
                },

                {
                    name: "Dot & Key Vitamin C + E Sunscreen SPF 50+",
                    type: "SUNSCREEN",
                    description: "Daily UV protection with a glow-focused formula.",
                    image: "https://www.reequil.com/cdn/shop/files/new_old.jpg?v=1770667604&width=800",
                    link: "https://www.dotandkey.com/collections/sunscreen"
                }

            ]
        },


        // =====================================
        // CLEAR SKIN
        // =====================================

        "Clear Skin": {

            title: "✨ Skin Maintenance",
            subtitle: "Your skin appears relatively clear — focus on maintaining hydration, cleansing and daily sun protection.",

            products: [

                {
                    name: "Cetaphil Gentle Skin Cleanser",
                    type: "GENTLE CLEANSER",
                    description: "A gentle cleanser designed for dry, normal and sensitive skin.",
                    image: "https://www.reequil.com/cdn/shop/files/2_6e87fbbc-bf98-47c0-a3e0-0e70073a9f91.jpg?v=1771239046&width=800",
                    link: "https://www.cetaphil.in/products-1/gentle-skin-cleanser/8906005274106-1.html"
                },

                {
                    name: "Minimalist B12 + Repair Complex 5.5% Moisturizer",
                    type: "MOISTURIZER",
                    description: "Lightweight hydration with barrier-supporting ingredients.",
                    image: "https://www.reequil.com/cdn/shop/files/2_e850209b-5067-42b8-9142-a13dfe1a6696.jpg?v=1772696350&width=800",
                    link: "https://beminimalist.co/collections/new-launches/products/vitamin-b12-repair-complex-5-5-face-moisturizer"
                },

                {
                    name: "Re'equil Ultra Matte Dry Touch Sunscreen SPF 50",
                    type: "DAILY SPF",
                    description: "Daily broad-spectrum sun protection with a lightweight finish.",
                    image: "https://www.reequil.com/cdn/shop/files/new_old.jpg?v=1770667604&width=800",
                    link: "https://www.reequil.com/collections/all/products/ultra-matte-dry-touch-sunscreen-gel-spf-50-pa"
                }

            ]
        }

    };


    // =====================================
    // SELECT RESULT
    // =====================================

    const normalizedConcern = normalizeConcern(concern);
    const selected = recommendations[normalizedConcern] || recommendations["Clear Skin"];


    // =====================================
    // CREATE PRODUCT CARDS
    // =====================================

    let productCards = "";

    selected.products.forEach(product => {

        productCards += `

            <div class="product-card">

                <img
                    src="${product.image}"
                    alt="${product.name}"
                    class="product-image"
                    loading="lazy"
                    onerror="this.onerror=null;this.src='data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"%3E%3Crect width="400" height="400" rx="24" fill="%23f8e1e8"/%3E%3Crect x="145" y="75" width="110" height="245" rx="22" fill="%23d98c80"/%3E%3Crect x="160" y="55" width="80" height="35" rx="8" fill="%23bd695e"/%3E%3Ctext x="200" y="365" font-size="20" text-anchor="middle" fill="%238a4b61" font-family="Arial"%3EAURA product%3C/text%3E%3C/svg%3E'"
                >

                <div class="product-content">

                    <span class="product-badge">
                        ${product.type}
                    </span>

                    <h3>
                        ${product.name}
                    </h3>

                    <p>
                        ${product.description}
                    </p>

                    <a
                        href="${product.link}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="product-btn"
                    >
                        View Product →
                    </a>

                </div>

            </div>

        `;
    });


    // =====================================
    // RETURN UI
    // =====================================

    return `

        <section class="recommendation-section">

            <div class="recommendation-heading">

                <h2>
                    ${selected.title}
                </h2>

                <p>
                    ${selected.subtitle}
                </p>

            </div>


            <div class="products-grid">

                ${productCards}

            </div>


            <div class="ai-disclaimer">

                ✨ These are cosmetic product suggestions
                based on the AI's visual observation.
                They are not medical diagnoses or treatment.

            </div>

        </section>

    `;
}

// Start only after the page's DOM and library scripts are available.

initializeApp();
