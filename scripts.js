// scripts.js

// === CONFIGURATION ===
const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632';
const FINAL_WIDTH = 1080;
const FINAL_HEIGHT = 700;
const ASPECT_RATIO = FINAL_WIDTH / FINAL_HEIGHT;
const TEMPLATE_URL = 'https://my.reviewshare.pics/i/31TmFySPG.png?';

// === GLOBAL STATE ===
let uploadedVehicleUrl = '';
let userReview = '';
let selectedRating = 0;
let cropper = null;
let cameraStream = null;
let currentCamera = 'environment';
let currentScale = 1;

// =======================
// UTILITY FUNCTIONS
// =======================
function dataURLtoBlob(dataurl) {
  const [header, b64] = dataurl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadToImgbb(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const form = new FormData();
  form.append('image', base64);
  form.append('key', IMGBB_API_KEY);
  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST', body: form
  });
  if (!res.ok) throw new Error('Upload failed: ' + await res.text());
  const json = await res.json();
  return json.data.display_url;
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  if (id === 'vehicleSharePage') {
    updateShareImage();
  }
}

function updateShareImage() {
  const select = document.getElementById('customTextSelect');
  let text = select.value;
  if (text === 'custom') {
    text = document.getElementById('customTextInput').value.trim().slice(0, 20);
  }
  const params = new URLSearchParams();
  params.append('custom_text_1', text);
  params.append('custom_image_1', uploadedVehicleUrl);
  document.getElementById('vehicleShareImage').src = TEMPLATE_URL + params.toString();
}

// =======================
// STAR RATING
// =======================
function initStarRating() {
  const stars = document.querySelectorAll('#reviewStarRating span');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = +star.dataset.value;
      stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= selectedRating));
    });
    star.addEventListener('mouseover', () => {
      const v = +star.dataset.value;
      stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= v));
    });
    star.addEventListener('mouseout', () => {
      stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= selectedRating));
    });
  });
}

// =======================
// CAMERA & CROPPER
// =======================
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const vid = document.getElementById('cameraPreview');
  if (vid && vid.srcObject) {
    vid.srcObject = null;
  }
}

function startCamera() {
  stopCamera();
  const vid = document.getElementById('cameraPreview');
  currentScale = 1;
  if (vid) vid.style.transform = 'scale(1)';
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Camera not available');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: currentCamera } })
    .then(stream => {
      cameraStream = stream;
      vid.srcObject = stream;
      const playPromise = vid.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {/* ignore */});
      }
      initPinchZoom(vid);
    })
    .catch(() => alert('Camera access denied'));
}

function initPinchZoom(video) {
  const pointers = new Map();
  let startDist = 0, startScale = currentScale;
  const zi = document.getElementById('zoomIndicator');
  video.onpointerdown = e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      startScale = currentScale;
    }
  };
  video.onpointermove = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      currentScale = startScale * (dist / startDist);
      video.style.transform = `scale(${currentScale})`;
      if (zi) {
        zi.style.display = 'block';
        zi.textContent = dist > startDist ? 'Zooming In…' : 'Zooming Out…';
      }
    }
  };
  ['pointerup','pointercancel'].forEach(evt => {
    video.addEventListener(evt, e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2 && zi) zi.style.display = 'none';
    });
  });
}

function captureFromCamera() {
  const vid = document.getElementById('cameraPreview');
  if (!vid) return;
  const CW = 2160, CH = 1400;
  const full = document.createElement('canvas');
  full.width = CW; full.height = CH;
  const fctx = full.getContext('2d');
  const scale = Math.max(CW / vid.videoWidth, CH / vid.videoHeight);
  const w = vid.videoWidth * scale, h = vid.videoHeight * scale;
  const dx = (CW - w) / 2, dy = (CH - h) / 2;
  fctx.drawImage(vid, 0, 0, vid.videoWidth, vid.videoHeight, dx, dy, w, h);
  const cropC = document.createElement('canvas');
  cropC.width = FINAL_WIDTH; cropC.height = FINAL_HEIGHT;
  cropC.getContext('2d').drawImage(full, 0, 0, CW, CH, 0, 0, FINAL_WIDTH, FINAL_HEIGHT);
  stopCamera();
  uploadToImgbb(cropC.toDataURL('image/jpeg'))
    .then(url => {
      uploadedVehicleUrl = url;
      showStep('vehicleSharePage');
    })
    .catch(err => alert(err));
}

function loadImageForCrop(src, isUrl = false) {
  const img = document.getElementById('cropImage');
  if (isUrl) img.crossOrigin = 'Anonymous';
  img.src = src;
  document.querySelectorAll('.photo-section').forEach(s => s.style.display = 'none');
  document.getElementById('cropSection').style.display = 'block';
  cropper?.destroy();
  cropper = new Cropper(img, {
    aspectRatio: ASPECT_RATIO,
    viewMode: 1,
    autoCropArea: 0.8,
    movable: true,
    zoomable: true,
    cropBoxResizable: false,
    cropBoxMovable: false
  });
}

function showQRPage() {
  const qr = document.getElementById('qrCodeImage');
  qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' +
            encodeURIComponent('justshar.ing/xyz');
  showStep('qrSharePage');
}

// =======================
// EVENT LISTENERS SETUP
// =======================
document.addEventListener('DOMContentLoaded', () => {
  // Step1 → Step2
  document.getElementById('takePhotoButton').onclick = () => {
    showStep('step2');
    document.querySelector('.photo-option[data-option="take"]').click();
  };
  document.getElementById('uploadPhotoButton').onclick = () => {
    showStep('step2');
    document.querySelector('.photo-option[data-option="upload"]').click();
  };

  // Photo Options
  document.querySelectorAll('.photo-option').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('photoOptions').style.display = 'none';
      document.querySelectorAll('.photo-section').forEach(s => s.style.display = 'none');
      const opt = btn.dataset.option;
      if (opt === 'take') {
        document.getElementById('takePhotoSection').style.display = 'block';
        startCamera();
      } else if (opt === 'upload') {
        document.getElementById('uploadPhotoSection').style.display = 'block';
      } else {
        document.getElementById('urlPhotoSection').style.display = 'block';
      }
    };
  });

  // Back to Options
  document.querySelectorAll('.backToOptions').forEach(btn => {
    btn.onclick = () => {
      stopCamera();
      document.getElementById('photoOptions').style.display = 'block';
      document.querySelectorAll('.photo-section').forEach(s => s.style.display = 'none');
    };
  });

  // Upload File
  document.getElementById('uploadInput').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => loadImageForCrop(ev.target.result);
    r.readAsDataURL(f);
  };

  // Paste URL
  document.getElementById('loadUrlImage').onclick = () => {
    const url = document.getElementById('imageUrlInput').value.trim();
    if (!url) return alert('Please enter a valid URL.');
    loadImageForCrop(url, true);
  };

  // Capture
  document.getElementById('capturePhoto').onclick = captureFromCamera;

  // Swap & Flash
  document.getElementById('swapCamera').onclick = () => {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    stopCamera(); startCamera();
  };
  document.getElementById('flashToggle').onclick = e => {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    if (!track.getCapabilities().torch) return;
    const on = e.currentTarget.classList.toggle('flash-on');
    track.applyConstraints({ advanced: [{ torch: on }] });
  };

  // Crop
  document.getElementById('cropButton').onclick = () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: FINAL_WIDTH, height: FINAL_HEIGHT });
    cropper.destroy(); cropper = null;
    uploadToImgbb(canvas.toDataURL('image/jpeg'))
      .then(url => {
        uploadedVehicleUrl = url;
        showStep('vehicleSharePage');
      })
      .catch(err => alert(err));
  };

  // Fit Entire
  document.getElementById('fitEntireButton').onclick = () => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = FINAL_WIDTH; c.height = FINAL_HEIGHT;
      const ctx = c.getContext('2d');
      const scC = Math.max(FINAL_WIDTH / img.width, FINAL_HEIGHT / img.height);
      const wC = img.width * scC, hC = img.height * scC;
      const xC = (FINAL_WIDTH - wC) / 2, yC = (FINAL_HEIGHT - hC) / 2;
      const scF = Math.min(FINAL_WIDTH / img.width, FINAL_HEIGHT / img.height);
      const wF = img.width * scF, hF = img.height * scF;
      const xF = (FINAL_WIDTH - wF) / 2, yF = (FINAL_HEIGHT - hF) / 2;
      if ('filter' in ctx) {
        ctx.filter = 'blur(40px)'; ctx.drawImage(img, xC, yC, wC, hC);
        ctx.filter = 'none';       ctx.drawImage(img, xF, yF, wF, hF);
      } else {
        ctx.drawImage(img, xF, yF, wF, hF);
      }
      uploadToImgbb(c.toDataURL('image/jpeg'))
        .then(url => {
          uploadedVehicleUrl = url;
          showStep('vehicleSharePage');
        })
        .catch(err => alert(err));
    };
    img.src = croppedDataUrl || img.src;
  };

  // Change Photo
  document.getElementById('changePhoto').onclick = () => {
    stopCamera();
    document.getElementById('photoOptions').style.display = 'block';
    document.querySelectorAll('.photo-section').forEach(s => s.style.display = 'none');
  };

  // Vehicle Share Controls
  document.getElementById('shareNowButton').onclick = async () => {
    try {
      await navigator.clipboard.writeText("https://GetMy.Deal/MichaelJones");
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch {
      alert("Failed to copy link");
    }
  };
  document.getElementById('customTextSelect').onchange = () => {
    const isCustom = document.getElementById('customTextSelect').value === 'custom';
    document.getElementById('customTextInput').style.display = isCustom ? 'block' : 'none';
    updateShareImage();
  };
  document.getElementById('applyTextButton').onclick = updateShareImage;
  document.getElementById('forwardFromVehicleShare').onclick = () => {
    showStep('reviewFormPage');
    initStarRating();
  };
  document.getElementById('backFromVehicleShare').onclick = () => showStep('step2');

  // Review Form
  document.getElementById('submitReviewForm').onclick = () => {
    const val = document.getElementById('reviewText').value.trim();
    if (!val) return alert("Please enter your review.");
    userReview = val;
    document.getElementById('reviewShareImage').src =
      `https://my.reviewshare.pics/i/pGdj8g8st.png?first_name=&job_title=${encodeURIComponent(val)}`;
    showStep('reviewSharePage');
  };
  document.getElementById('backFromReviewForm').onclick = () => showStep('vehicleSharePage');

  // Review Share
  document.getElementById('reviewShareButton').onclick = async () => {
    try {
      await navigator.clipboard.writeText("https://GetMy.Deal/MichaelJones");
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch {
      alert("Failed to copy link");
    }
  };
  document.getElementById('forwardFromReviewShare').onclick = () => showStep('googleReviewPage');
  document.getElementById('backFromReviewShare').onclick = () => {
    showStep('reviewFormPage');
    initStarRating();
  };

  // Google Review
  document.getElementById('googleReviewButton').onclick = async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('reviewText').value.trim());
      Swal.fire({ icon:'info', title:'Review copied! Paste it on Google.' })
        .then(() => window.open(
          'https://search.google.com/local/writereview?placeid=ChIJAQB0dE1YkWsRXSuDBDHLr3M',
          '_blank'
        ))
        .then(() => setTimeout(() => showStep('finalOptionsPage'), 1000));
    } catch {
      alert("Failed to copy review");
    }
  };
  document.getElementById('backFromGoogleReview').onclick = () => showStep('reviewSharePage');
  document.getElementById('forwardFromGoogleReview').onclick = () => showStep('finalOptionsPage');

  // Final Options
  document.getElementById('textLinkFinal').onclick = () => alert("Text sent! Link: https://GetMy.Deal/MichaelJones");
  document.getElementById('emailLinkFinal').onclick = () => alert("Email sent! Link: https://GetMy.Deal/MichaelJones");
  document.getElementById('backFromFinalOptions').onclick = () => showStep('googleReviewPage');
  document.getElementById('shareVehicleFinalButton').onclick = async () => {
    try {
      await navigator.clipboard.writeText("https://GetMy.Deal/MichaelJones");
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch {
      alert("Failed to copy link");
    }
  };
  document.getElementById('shareReviewFinalButton').onclick = async () => {
    try {
      await navigator.clipboard.writeText("https://GetMy.Deal/MichaelJones");
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch {
      alert("Failed to copy link");
    }
  };

  // QR Page Back
  document.getElementById('backFromQR').onclick = () => showStep('vehicleSharePage');
});
