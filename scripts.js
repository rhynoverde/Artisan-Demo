// scripts.js
// Version d-3.0.3

// === CONFIGURATION ===
const IMGBB_API_KEY  = 'd44d592f97ef193ce535a799d00ef632';
const FINAL_WIDTH    = 1080;
const FINAL_HEIGHT   = 700;
const ASPECT_RATIO   = FINAL_WIDTH / FINAL_HEIGHT;
const TEMPLATE_URL   = 'https://my.reviewshare.pics/i/31TmFySPG.png?';

// === GLOBAL STATE ===
let uploadedVehicleUrl = '';
let userReview         = '';
let selectedRating     = 0;
let cropper           = null;
let cameraStream      = null;
let currentCamera     = 'environment';
let currentScale      = 1;

// =======================
// UTILITY FUNCTIONS
// =======================
function dataURLtoBlob(dataurl) {
  const [header,b64] = dataurl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const raw  = atob(b64);
  const arr  = new Uint8Array(raw.length);
  for (let i=0; i<raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadToImgbb(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const form   = new FormData();
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
  if (id === 'vehicleSharePage') updateShareImage();
}

function updateShareImage() {
  let text = document.getElementById('customTextSelect').value;
  if (text === 'custom') {
    text = document.getElementById('customTextInput').value.trim().slice(0,20);
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
    const v = +star.dataset.value;
    star.addEventListener('click', () => {
      selectedRating = v;
      stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= v));
    });
    star.addEventListener('mouseover', () => {
      stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= v));
    });
    star.addEventListener('mouseout', () => {
      stars.forEach(s => s.classList.toggle('selected', +s.dataset.value <= selectedRating));
    });
  });
}

// =======================
// CAMERA CONTROL
// =======================
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('cameraPreview').srcObject = null;
}

function startCamera() {
  stopCamera();
  const vid = document.getElementById('cameraPreview');
  currentScale = 1;
  vid.style.transform = 'scale(1)';
  vid.muted = true;
  vid.playsInline = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Camera not available');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video:{ facingMode: currentCamera } })
    .then(stream => {
      cameraStream = stream;
      vid.srcObject   = stream;
      vid.play().catch(()=>{});
      initPinchZoom(vid);
    })
    .catch(()=> alert('Camera access denied'));
}

function initPinchZoom(video) {
  const pointers = new Map();
  let startDist = 0, startScale = currentScale;
  const zi = document.getElementById('zoomIndicator');

  video.onpointerdown = e => {
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      startDist  = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      startScale = currentScale;
    }
  };
  video.onpointermove = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      currentScale = startScale * (dist / startDist);
      video.style.transform = `scale(${currentScale})`;
      zi.style.display = 'block';
      zi.textContent   = dist>startDist?'Zooming In…':'Zooming Out…';
    }
  };
  ['pointerup','pointercancel'].forEach(evt =>
    video.addEventListener(evt, e => {
      pointers.delete(e.pointerId);
      if (pointers.size<2) zi.style.display='none';
    })
  );
}

// =======================
// CAPTURE & CROP
// =======================
function captureFromCamera() {
  const vid = document.getElementById('cameraPreview');
  if (!vid) return;
  const CW=2160, CH=1400;
  const full = document.createElement('canvas');
  full.width= CW; full.height=CH;
  const fctx= full.getContext('2d');
  const sc = Math.max(CW/vid.videoWidth, CH/vid.videoHeight);
  const w  = vid.videoWidth*sc, h=vid.videoHeight*sc;
  const dx = (CW-w)/2, dy=(CH-h)/2;
  fctx.drawImage(vid, 0,0, vid.videoWidth,vid.videoHeight, dx,dy, w,h);

  const cropC = document.createElement('canvas');
  cropC.width = FINAL_WIDTH; cropC.height = FINAL_HEIGHT;
  cropC.getContext('2d')
    .drawImage(full,0,0, CW,CH, 0,0, FINAL_WIDTH,FINAL_HEIGHT);

  stopCamera();
  uploadToImgbb(cropC.toDataURL('image/jpeg'))
    .then(url=> {
      uploadedVehicleUrl = url;
      showStep('vehicleSharePage');
    })
    .catch(err=> alert(err));
}

function loadImageForCrop(src, isUrl=false) {
  const img = document.getElementById('cropImage');
  if (isUrl) img.crossOrigin='Anonymous';
  img.src = src;
  document.querySelectorAll('.photo-section').forEach(s=>s.style.display='none');
  document.getElementById('cropSection').style.display = 'block';
  cropper?.destroy();
  cropper = new Cropper(img, {
    aspectRatio: ASPECT_RATIO,
    viewMode:1, autoCropArea:0.8,
    movable:true, zoomable:true,
    cropBoxMovable:false, cropBoxResizable:false
  });
}

function showQRPage() {
  document.getElementById('qrCodeImage').src =
    'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' +
    encodeURIComponent('justshar.ing/xyz');
  showStep('qrSharePage');
}

// =======================
// EVENT LISTENERS
// =======================
document.addEventListener('DOMContentLoaded', ()=> {
  // ** INTRO BUTTONS **  
  document.getElementById('takePhotoButton')?.addEventListener('click', ()=>{
    showStep('step2');
    document.getElementById('photoOptions').style.display='none';
    document.querySelectorAll('.photo-section').forEach(s=>s.style.display='none');
    document.getElementById('takePhotoSection').style.display='block';
    startCamera();
  });
  document.getElementById('uploadPhotoButton')?.addEventListener('click', ()=>{
    showStep('step2');
    document.getElementById('photoOptions').style.display='none';
    document.querySelectorAll('.photo-section').forEach(s=>s.style.display='none');
    document.getElementById('uploadPhotoSection').style.display='block';
    // document.getElementById('uploadInput').click(); // optional
  });

  // ** STEP 2 OPTION BUTTONS **
  document.querySelectorAll('#photoOptions .photo-option').forEach(btn=>
    btn.addEventListener('click', ()=>{
      document.getElementById('photoOptions').style.display='none';
      document.querySelectorAll('.photo-section').forEach(s=>s.style.display='none');
      const opt = btn.dataset.option;
      if (opt==='take') {
        document.getElementById('takePhotoSection').style.display='block';
        startCamera();
      } else if (opt==='upload') {
        document.getElementById('uploadPhotoSection').style.display='block';
      } else {
        document.getElementById('urlPhotoSection').style.display='block';
      }
    })
  );

  // back-to-options
  document.querySelectorAll('.backToOptions').forEach(b=>
    b.addEventListener('click', ()=>{
      stopCamera();
      document.getElementById('photoOptions').style.display='block';
      document.querySelectorAll('.photo-section').forEach(s=>s.style.display='none');
    })
  );

  // file upload
  document.getElementById('uploadInput').addEventListener('change', e=>{
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => loadImageForCrop(ev.target.result);
    r.readAsDataURL(f);
  });

  // paste URL
  document.getElementById('loadUrlImage').addEventListener('click', ()=>{
    const url = document.getElementById('imageUrlInput').value.trim();
    if (!url) return alert('Please enter a valid URL.');
    loadImageForCrop(url,true);
  });

  // capture
  document.getElementById('capturePhoto').addEventListener('click', captureFromCamera);

  // swap / flash
  document.getElementById('swapCamera').addEventListener('click', ()=>{
    currentCamera = currentCamera==='environment'?'user':'environment';
    startCamera();
  });
  document.getElementById('flashToggle').addEventListener('click', e=>{
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    if (!track.getCapabilities().torch) return;
    const on = e.currentTarget.classList.toggle('flash-on');
    track.applyConstraints({ advanced:[{ torch:on }] });
  });

  // crop & fit
  document.getElementById('cropButton').addEventListener('click', ()=>{
    if (!cropper) return;
    const c = cropper.getCroppedCanvas({ width:FINAL_WIDTH, height:FINAL_HEIGHT });
    cropper.destroy(); cropper = null;
    uploadToImgbb(c.toDataURL('image/jpeg'))
      .then(url=> {
        uploadedVehicleUrl = url;
        showStep('vehicleSharePage');
      })
      .catch(err=>alert(err));
  });
  document.getElementById('fitEntireButton').addEventListener('click', ()=>{
    const img = new Image();
    img.crossOrigin='Anonymous';
    img.onload = ()=>{
      const c = document.createElement('canvas');
      c.width=FINAL_WIDTH; c.height=FINAL_HEIGHT;
      const ctx = c.getContext('2d');
      const scC = Math.max(FINAL_WIDTH/img.width, FINAL_HEIGHT/img.height);
      const wC = img.width*scC, hC = img.height*scC;
      ctx.filter = 'blur(40px)';
      ctx.drawImage(img,(FINAL_WIDTH-wC)/2,(FINAL_HEIGHT-hC)/2,wC,hC);
      ctx.filter = 'none';
      const scF = Math.min(FINAL_WIDTH/img.width, FINAL_HEIGHT/img.height);
      const wF = img.width*scF, hF = img.height*scF;
      ctx.drawImage(img,(FINAL_WIDTH-wF)/2,(FINAL_HEIGHT-hF)/2,wF,hF);
      uploadToImgbb(c.toDataURL('image/jpeg'))
        .then(url=>{
          uploadedVehicleUrl = url;
          showStep('vehicleSharePage');
        })
        .catch(err=>alert(err));
    };
    img.src = uploadedVehicleUrl;
  });

  // change photo
  document.getElementById('changePhoto').addEventListener('click', ()=>{
    stopCamera();
    document.getElementById('photoOptions').style.display='block';
    document.querySelectorAll('.photo-section').forEach(s=>s.style.display='none');
  });

  // share photo
  document.getElementById('shareNowButton').addEventListener('click', async ()=>{
    const listingLink = 'https://www.etsy.com/listing/1088793681/willow-and-wood-signature-scented-soy';
    try {
      await navigator.clipboard.writeText(listingLink);
      Swal.fire({
        title: `<strong>Listing Link Saved!</strong>`,
        html: `<p>Your link was copied—now share the photo!</p>`,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Got it!',
        cancelButtonText: 'More Instructions'
      }).then(async res=>{
        if (res.isConfirmed && navigator.share) {
          const imgEl = document.getElementById('vehicleShareImage');
          if (imgEl?.src) {
            const resp = await fetch(imgEl.src);
            const blob = await resp.blob();
            const ext = imgEl.src.endsWith('.png')?'png':'jpg';
            const file = new File([blob], `share.${ext}`, { type: blob.type });
            await navigator.share({ files:[file], text: listingLink });
          }
        }
      });
    } catch {
      alert('Failed to copy link');
    }
  });

  // customize text
  document.getElementById('customTextSelect').addEventListener('change', ()=>{
    const show = document.getElementById('customTextSelect').value==='custom';
    document.getElementById('customTextInput').style.display = show?'block':'none';
    updateShareImage();
  });
  document.getElementById('applyTextButton').addEventListener('click', updateShareImage);

  // forward/back
  document.getElementById('forwardFromVehicleShare').addEventListener('click', ()=>{
    showStep('reviewFormPage');
    initStarRating();
  });
  document.getElementById('backFromVehicleShare').addEventListener('click', ()=>showStep('step2'));

  // submit review form
  document.getElementById('submitReviewForm').addEventListener('click', ()=>{
    const val = document.getElementById('reviewText').value.trim();
    if (!val) return alert('Please enter your review.');
    userReview = val;
    document.getElementById('reviewShareImage').src =
      `https://my.reviewshare.pics/i/pGdj8g8st.png?first_name=&job_title=${encodeURIComponent(val)}`;
    showStep('reviewSharePage');
  });
  document.getElementById('backFromReviewForm').addEventListener('click', ()=>showStep('vehicleSharePage'));

  // share review link
  document.getElementById('reviewShareButton').addEventListener('click', async ()=>{
    try {
      await navigator.clipboard.writeText('https://GetMy.Deal/MichaelJones');
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch {
      alert('Failed to copy link');
    }
  });
  document.getElementById('forwardFromReviewShare').addEventListener('click', ()=>showStep('googleReviewPage'));
  document.getElementById('backFromReviewShare').addEventListener('click', ()=>{
    showStep('reviewFormPage'); initStarRating();
  });

  // google review
  document.getElementById('googleReviewButton').addEventListener('click', async ()=>{
    const text = document.getElementById('reviewText').value.trim();
    try {
      await navigator.clipboard.writeText(text);
      Swal.fire({ icon:'info', title:'Review copied! Paste on Google.' })
        .then(()=> window.open(
          'https://search.google.com/local/writereview?placeid=ChIJFRctSC6LMW0Rd0T5nvajzPw',
          '_blank'
        ))
        .then(()=> setTimeout(()=>showStep('finalOptionsPage'),1000));
    } catch {
      alert('Failed to copy review');
    }
  });
  document.getElementById('backFromGoogleReview').addEventListener('click', ()=>showStep('reviewSharePage'));
  document.getElementById('forwardFromGoogleReview').addEventListener('click', ()=>showStep('finalOptionsPage'));

  // final options share/copy
  document.getElementById('shareVehicleFinalButton').addEventListener('click', async ()=>{
    try {
      await navigator.clipboard.writeText('https://GetMy.Deal/MichaelJones');
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch { alert('Failed to copy link'); }
  });
  document.getElementById('shareReviewFinalButton').addEventListener('click', async ()=>{
    try {
      await navigator.clipboard.writeText('https://GetMy.Deal/MichaelJones');
      Swal.fire({ icon:'success', title:'Link copied!' });
    } catch { alert('Failed to copy link'); }
  });
  document.getElementById('copyReviewText').addEventListener('click', async ()=>{
    try {
      await navigator.clipboard.writeText(document.getElementById('finalReviewText').value.trim());
      Swal.fire({ icon:'success', title:'Review text copied!' });
    } catch { alert('Failed to copy text'); }
  });
  document.getElementById('textLinkFinal').addEventListener('click', ()=>alert('Text sent! Link: https://GetMy.Deal/MichaelJones'));
  document.getElementById('emailLinkFinal').addEventListener('click', ()=>alert('Email sent! Link: https://GetMy.Deal/MichaelJones'));
  document.getElementById('backFromFinalOptions').addEventListener('click', ()=>showStep('googleReviewPage'));

  // QR back
  document.getElementById('backFromQR').addEventListener('click', ()=>showStep('vehicleSharePage'));
});
