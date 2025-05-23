/*  scripts.js  – Artisan Demo  (Version d-3.2.3)  */

const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632';
const FINAL_WIDTH   = 1080;
const FINAL_HEIGHT  = 700;
const ASPECT_RATIO  = FINAL_WIDTH / FINAL_HEIGHT;

/* ── project‑wide constants ───────────────────────────────────────── */
const ETSY_LINK           = 'https://www.etsy.com/listing/1088793681/willow-and-wood-signature-scented-soy';
const TEMPLATE_URL        = 'https://my.reviewshare.pics/i/31TmFySPG.png?';
const REVIEW_TEMPLATE_URL = 'https://my.reviewshare.pics/i/FydUOQzdg.png?';

/* ── global state ─────────────────────────────────────────────────── */
let uploadedVehicleUrl = '';
let originalPhotoUrl   = '';            // raw photo after capture / upload
let userReview         = '';
let selectedRating     = 0;
let cropper            = null;
let cameraStream       = null;
let currentCamera      = 'environment';
let currentScale       = 1;

/* ── helpers ──────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const qs = s  => document.querySelector(s);
const qa = s  => document.querySelectorAll(s);

/* robust clipboard helper (Clipboard API + execCommand fallback) */
async function copyText(text){
  if (navigator.clipboard && window.isSecureContext){
    try{ await navigator.clipboard.writeText(text); return; }
    catch(e){ /* fall back */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity  = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try{ document.execCommand('copy'); } finally{ document.body.removeChild(ta); }
}

async function uploadToImgbb(dataUrl){
  const res = await fetch('https://api.imgbb.com/1/upload',{
    method:'POST',
    body:new URLSearchParams({key:IMGBB_API_KEY,image:dataUrl.split(',')[1]})
  });
  if(!res.ok) throw new Error(await res.text());
  return (await res.json()).data.display_url;
}

/** Upload to Cloudinary (unsigned preset) */
async function uploadToCloudinary(dataUrl){
  const fd = new FormData();
  fd.append('file', dataUrl);
  fd.append('upload_preset', 'CustomerPhotos');  // your unsigned preset
  const res = await fetch(
    'https://api.cloudinary.com/v1_1/dag0w6gtd/image/upload',
    { method: 'POST', body: fd }
  );
  if (!res.ok) throw new Error(`Cloudinary ${res.status}`);
  const j = await res.json();
  return j.secure_url;
}

/** Try ImgBB (3 s); on error or timeout → Cloudinary */
async function uploadImageWithFallback(dataUrl){
  try {
    const url = await Promise.race([
      uploadToImgbb(dataUrl),
      new Promise((_, rej) => setTimeout(()=>rej(new Error('ImgBB timeout')), 3000))
    ]);
    console.log('✅ Uploaded via ImgBB:', url);
    return url;
  } catch(err) {
    console.warn('⚠️ ImgBB failed, falling back to Cloudinary:', err);
    const url = await uploadToCloudinary(dataUrl);
    console.log('✅ Uploaded via Cloudinary:', url);
    return url;
  }
}


function showStep(id){
  qa('.step').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  if(id==='vehicleSharePage') updateShareImage();
}

/* ── loading overlay helpers ───────────────────────────────────────── */
function showLoading(imgEl,text='Loading…'){
  const wrap=imgEl.parentElement;
  const ov=document.createElement('div');
  ov.className='loading-overlay';
  ov.textContent=text;
  wrap.style.position='relative';
  wrap.appendChild(ov);
  imgEl.addEventListener('load',()=>ov.remove(),{once:true});
}

/* ── customise text ───────────────────────────────────────────────── */
function updateShareImage(){
  const img=$('vehicleShareImage');
  if(!uploadedVehicleUrl){img.removeAttribute('src');return;}
  let txt=$('customTextSelect').value;
  if(txt==='custom') txt=$('customTextInput').value.trim().slice(0,20);
  const qsStr=new URLSearchParams({custom_text_1:txt,custom_image_1:uploadedVehicleUrl}).toString();
  showLoading(img,'Updating…');
  img.src=TEMPLATE_URL+qsStr;
}

/* ── star rating UI ───────────────────────────────────────────────── */
function initStarRating(){
  const stars=qa('#reviewStarRating span');
  const paint=v=>stars.forEach(s=>s.classList.toggle('selected',+s.dataset.value<=v));
  stars.forEach(st=>{
    const v=+st.dataset.value;
    st.onclick     =()=>{selectedRating=v;paint(v)};
    st.onmouseover =()=>paint(v);
    st.onmouseout  =()=>paint(selectedRating);
  });
}

/* ── CAMERA + pinch‑zoom ──────────────────────────────────────────── */
const activePointers=new Map();
function initPinchZoom(v){
  activePointers.clear();let startDist=0,startScale=currentScale;
  const zi=$('zoomIndicator');
  v.onpointerdown=e=>{
    activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activePointers.size===2){
      const [p1,p2]=activePointers.values();
      startDist=Math.hypot(p1.x-p2.x,p1.y-p2.y);
      startScale=currentScale;
    }
  };
  v.onpointermove=e=>{
    if(!activePointers.has(e.pointerId))return;
    activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activePointers.size===2){
      const [p1,p2]=activePointers.values();
      const d=Math.hypot(p1.x-p2.x,p1.y-p2.y);
      currentScale=startScale*(d/startDist);
      v.style.transform=`scale(${currentScale})`;
      if(zi){
        zi.style.display='block';
        zi.textContent=d>startDist?'Zooming In…':'Zooming Out…';
      }
    }
  };
  ['pointerup','pointercancel'].forEach(evt=>v.addEventListener(evt,e=>{
    activePointers.delete(e.pointerId);
    if(activePointers.size<2&&zi) zi.style.display='none';
  }));
}

function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
  const v=$('cameraPreview');if(v) v.srcObject=null;
}

function startCamera(){
  stopCamera();
  const v=$('cameraPreview');currentScale=1;if(v) v.style.transform='scale(1)';
  navigator.mediaDevices?.getUserMedia({video:{facingMode:currentCamera}})
    .then(st=>{cameraStream=st;v.srcObject=st;v.play();initPinchZoom(v);})
    .catch(()=>alert('Camera access denied or not available.'));
}

/* ── capture & crop ───────────────────────────────────────────────── */
function captureFromCamera(){
  const v=$('cameraPreview');if(!v)return;
  const CW=2160,CH=1400;
  const full=document.createElement('canvas');full.width=CW;full.height=CH;
  const ctx=full.getContext('2d');
  const sc=Math.max(CW/v.videoWidth,CH/v.videoHeight);
  const w=v.videoWidth*sc,h=v.videoHeight*sc,dx=(CW-w)/2,dy=(CH-h)/2;
  ctx.drawImage(v,0,0,v.videoWidth,v.videoHeight,dx,dy,w,h);
  const crop=document.createElement('canvas');crop.width=FINAL_WIDTH;crop.height=FINAL_HEIGHT;
  crop.getContext('2d').drawImage(full,0,0,CW,CH,0,0,FINAL_WIDTH,FINAL_HEIGHT);

  originalPhotoUrl = crop.toDataURL('image/jpeg'); // save raw

  stopCamera();
  showLoading($('vehicleShareImage'));
  uploadImageWithFallback(crop.toDataURL('image/jpeg'))
  .then(url=>{uploadedVehicleUrl=url;showStep('vehicleSharePage');})
  .catch(e=>alert(e));

}

function loadImageForCrop(src,isUrl=false){
  originalPhotoUrl = src;
  const img=$('cropImage');
  if(isUrl) img.crossOrigin='Anonymous';
  img.src=src;
  qa('.photo-section').forEach(s=>s.style.display='none');
  $('cropSection').style.display='block';
  cropper?.destroy();
  cropper=new Cropper(img,{
    aspectRatio:ASPECT_RATIO,viewMode:1,autoCropArea:0.8,dragMode:'move',
    movable:true,zoomable:true,cropBoxResizable:false,cropBoxMovable:false
  });
}

/* ── QR helper ────────────────────────────────────────────────────── */
function showQRPage(){
  $('qrCodeImage').src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data='+encodeURIComponent('justshar.ing/xyz');
  showStep('qrSharePage');
}

/* ── character counter for review ─────────────────────────────────── */
function updateCharCount(){
  const ta=$('reviewText');
  const text=ta.value;
  const lineBreaks=(text.match(/\n/g)||[]).length;
  const max=230-(lineBreaks*40);
  const left=max-text.length;
  const cc=$('charCount');
  cc.textContent=`${left} characters left`;
  cc.classList.toggle('red',left<=0);
  if(left<0){
    ta.value=text.slice(0,max);
    updateCharCount();
  }
}

/* ── DOMContentLoaded main block ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{

  /* random preset */
  const sel=$('customTextSelect');
  const presets=[...sel.options].filter(o=>o.value!=='custom');
  sel.value=presets[Math.floor(Math.random()*presets.length)].value;

  /* customise text UI */
  const customIn=$('customTextInput'),applyBtn=$('applyTextButton');
  sel.onchange=()=>{
    const cust=sel.value==='custom';
    customIn.style.display=cust?'block':'none';
    applyBtn.style.display=cust?'inline-block':'none';
    if(!cust) updateShareImage();
    if(cust) customIn.focus();
  };
  applyBtn.onclick=updateShareImage;
  customIn.onkeyup=e=>{if(e.key==='Enter')applyBtn.click();};

  /* intro buttons */
  $('takePhotoButton').onclick=()=>{
    showStep('step2');
    $('photoOptions').style.display='none';
    qa('.photo-section').forEach(s=>s.style.display='none');
    $('takePhotoSection').style.display='block';
    startCamera();
  };
  $('uploadPhotoButton').onclick=()=>{
    showStep('step2');
    $('photoOptions').style.display='none';
    qa('.photo-section').forEach(s=>s.style.display='none');
    $('uploadPhotoSection').style.display='block';
  };

  /* step‑2 inner options */
  qa('#photoOptions .photo-option').forEach(btn=>btn.onclick=()=>{
    $('photoOptions').style.display='none';
    qa('.photo-section').forEach(s=>s.style.display='none');
    const opt=btn.dataset.option;
    if(opt==='take'){ $('takePhotoSection').style.display='block';startCamera();}
    else if(opt==='upload'){ $('uploadPhotoSection').style.display='block';}
    else $('urlPhotoSection').style.display='block';
  });
  qa('.backToOptions').forEach(b=>b.onclick=()=>{
    stopCamera();
    $('photoOptions').style.display='block';
    qa('.photo-section').forEach(s=>s.style.display='none');
  });

  /* file / url */
  $('uploadInput').onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>loadImageForCrop(ev.target.result);
    r.readAsDataURL(f);
  };
  $('loadUrlImage').onclick=()=>{
    const u=$('imageUrlInput').value.trim();
    if(!u) return alert('Enter a valid URL');
    loadImageForCrop(u,true);
  };

  /* camera controls */
  $('capturePhoto').onclick=captureFromCamera;
  $('swapCamera').onclick=()=>{
    currentCamera=currentCamera==='environment'?'user':'environment';
    startCamera();
  };
  $('flashToggle').onclick=e=>{
    if(!cameraStream)return;
    const track=cameraStream.getVideoTracks()[0];
    if(!track.getCapabilities().torch)return;
    const on=e.currentTarget.classList.toggle('flash-on');
    track.applyConstraints({advanced:[{torch:on}]});
  };

  /* crop buttons */
  $('cropButton').onclick=()=>{
    if(!cropper)return;
    const can=cropper.getCroppedCanvas({width:FINAL_WIDTH,height:FINAL_HEIGHT});
    cropper.destroy();cropper=null;
    showLoading($('vehicleShareImage'));
    uploadImageWithFallback(can.toDataURL('image/jpeg'))
    .then(url=>{uploadedVehicleUrl=url;showStep('vehicleSharePage');})
    .catch(e=>alert(e));

  };
  $('fitEntireButton').onclick=()=>{
    const src=uploadedVehicleUrl||$('cropImage').src;
    if(!src)return;
    const img=new Image();img.crossOrigin='Anonymous';
    img.onload=()=>{
      const cnv=document.createElement('canvas');cnv.width=FINAL_WIDTH;cnv.height=FINAL_HEIGHT;
      const ctx=cnv.getContext('2d');
      const scC=Math.max(FINAL_WIDTH/img.width,FINAL_HEIGHT/img.height);
      ctx.filter='blur(40px)';
      ctx.drawImage(img,(FINAL_WIDTH-img.width*scC)/2,(FINAL_HEIGHT-img.height*scC)/2,img.width*scC,img.height*scC);
      ctx.filter='none';
      const scF=Math.min(FINAL_WIDTH/img.width,FINAL_HEIGHT/img.height);
      ctx.drawImage(img,(FINAL_WIDTH-img.width*scF)/2,(FINAL_HEIGHT-img.height*scF)/2,img.width*scF,img.height*scF);
      showLoading($('vehicleShareImage'));
      uploadImageWithFallback(cnv.toDataURL('image/jpeg'))
        .then(url=>{uploadedVehicleUrl=url;showStep('vehicleSharePage');})
        .catch(e=>alert(e));      
    };
    img.src=src;
  };
  $('changePhoto').onclick=()=>{
    stopCamera();
    $('photoOptions').style.display='block';
    qa('.photo-section').forEach(s=>s.style.display='none');
  };

  /* vehicle share page */
  $('shareNowButton').onclick=async ()=>{
    try{
      await copyText(ETSY_LINK);

      Swal.fire({
        title: 'Etsy Link Copied!',
        html: `
          <p>The Etsy store link for Willow & Whimsy was saved to your clipboard.</p>
          <ul style="text-align:left; margin-top:20px; list-style:none; padding:0; animation: fadeInList 1s ease-in-out;">
            <li style="margin-bottom:20px;">
              <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" alt="Instagram" style="width:24px;height:24px;vertical-align:middle;margin-right:10px;">
              <strong>Instagram:</strong> Paste it as a Link Sticker in an Instagram Story.
            </li>
            <li style="margin-bottom:20px;">
              <img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" alt="Facebook" style="width:24px;height:24px;vertical-align:middle;margin-right:10px;">
              <strong>Facebook:</strong> Paste it in the post description or first comment (preferred).
            </li>
            <li>
              <img src="https://cdn-icons-png.flaticon.com/512/742/742751.png" alt="Smiley" style="width:24px;height:24px;vertical-align:middle;margin-right:10px;">
              <strong>Other Places:</strong> Share it anywhere you post your image!
            </li>
          </ul>
          <style>
            @keyframes fadeInList {
              0% { opacity: 0; transform: translateY(10px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          </style>
        `,
        icon: 'success',
        confirmButtonText: 'Got it, Share Image Now!',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showCancelButton: false
      }).then(async res=>{
        if(res.isConfirmed && navigator.share){
          const blob=await(await fetch($('vehicleShareImage').src)).blob();
          await navigator.share({files:[new File([blob],'product.jpg',{type:blob.type})]});
        }
      });
    }catch{alert('Failed to copy link');}
  };
  $('forwardFromVehicleShare').onclick=()=>{showStep('reviewFormPage');initStarRating();};
  $('backFromVehicleShare').onclick=()=>showStep('step2');

  /* review form */
  $('reviewText').addEventListener('input',updateCharCount);
  updateCharCount();
  initStarRating();
  $('submitReviewForm').onclick=()=>{
    const rev=$('reviewText').value.trim();
    const nm=$('reviewerName').value.trim();
    if(selectedRating===0) return alert('Please select a star rating.');
    if(!rev) return alert('Please enter a review.');
    if(!nm)  return alert('Please enter your name.');
    userReview=rev;
    const img=$('reviewShareImage');
    showLoading(img);
    img.src=REVIEW_TEMPLATE_URL+'first_name='+encodeURIComponent(nm)+'&job_title='+encodeURIComponent(rev);
    showStep('reviewSharePage');
  };
  $('backFromReviewForm').onclick=()=>showStep('vehicleSharePage');

  /* review share */
  $('reviewShareButton').onclick=async ()=>{
    try{
      await copyText(ETSY_LINK);

      Swal.fire({
        title: 'Etsy Link Copied!',
        html: `
          <p>The Etsy store link for Willow & Whimsy was saved to your clipboard.</p>
          <ul style="text-align:left; margin-top:20px; list-style:none; padding:0; animation: fadeInList 1s ease-in-out;">
            <li style="margin-bottom:20px;">
              <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" alt="Instagram" style="width:24px;height:24px;vertical-align:middle;margin-right:10px;">
              <strong>Instagram:</strong> Paste it as a Link Sticker in an Instagram Story.
            </li>
            <li style="margin-bottom:20px;">
              <img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" alt="Facebook" style="width:24px;height:24px;vertical-align:middle;margin-right:10px;">
              <strong>Facebook:</strong> Paste it in the post description or first comment (preferred).
            </li>
            <li>
              <img src="https://cdn-icons-png.flaticon.com/512/742/742751.png" alt="Smiley" style="width:24px;height:24px;vertical-align:middle;margin-right:10px;">
              <strong>Other Places:</strong> Share it anywhere you post your image!
            </li>
          </ul>
          <style>
            @keyframes fadeInList {
              0% { opacity: 0; transform: translateY(10px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          </style>
        `,
        icon: 'success',
        confirmButtonText: 'Got it, Share Image Now!',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showCancelButton: false
      }).then(async res=>{
        if(res.isConfirmed && navigator.share){
          const blob=await(await fetch($('reviewShareImage').src)).blob();
          await navigator.share({files:[new File([blob],'review.jpg',{type:blob.type})]});
        }
      });
    }catch{alert('Failed to copy link');}
  };
  $('forwardFromReviewShare').onclick=()=>showStep('googleReviewPage');
  $('backFromReviewShare').onclick=()=>{showStep('reviewFormPage');initStarRating();};

  /* google review */
  $('googleReviewButton').onclick=async ()=>{
    try{
      const reviewTxt =
      (userReview && userReview.trim()) ||
      ($('finalReviewText') ? $('finalReviewText').value.trim() : '') ||
      ($('reviewText')      ? $('reviewText').value.trim()      : '');

      if(reviewTxt) await copyText(reviewTxt);

      Swal.fire({
        title: 'Post Your Review on Google!',
        html: `
          <p>You can save your image to your photos to attach to your review. Just long tap/press on your photo then save it to your phone as shown.</p>
          <img src="https://f000.backblazeb2.com/file/EmbrFyr/Instructional-Images/LongPressSaveToPhotos.jpg" 
               alt="Save to Photos Instruction" 
               style="margin: 15px auto; display:block; max-width: 50%; border-radius: 10px; box-shadow: 0 0 8px rgba(0,0,0,0.15);">
          <div id="customerImageContainer" style="margin-top:20px; width:100%; height:150px; display:flex; justify-content:center; align-items:center; background-color:#f0f0f0; color:#888; font-size:16px;">
            Loading photo...
          </div>
          <ol style="text-align:left; margin-top:20px; font-size:16px;">
            When you get to google (you may need to sign in first), Do the following:
            <li>Select your star rating</li>
            <li>Paste Review in review box (hold finger until paste options appears)</li>
            <li>Add photo(s) to your review (optional but highly helpful and appreciated)</li>
            <li>Tap post button</li>
          </ol>
          <p style="margin-top:10px; font-size:16px;"><strong>That's it!</strong></p>
          <style>
            #customerImageContainer img {
              max-width: 50%;
              max-height: 100%;
              animation: fadeInImage 0.5s ease-in-out;
              display: block;
            }
            @keyframes fadeInImage {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          </style>
        `,
        showConfirmButton:true,
        confirmButtonText:'Got it, Paste Google Review',
        allowOutsideClick:false,
        allowEscapeKey:true,
        didOpen:()=>{
          const container=$('customerImageContainer');
          if(!originalPhotoUrl){
            container.innerHTML='<p style="color:red;">Photo failed to load.</p>';
            return;
          }
          const img=new Image();
          img.src=originalPhotoUrl;
          img.onload=()=>{container.innerHTML='';container.appendChild(img);};
          img.onerror=()=>{container.innerHTML='<p style="color:red;">Photo failed to load.</p>';};
        }
      }).then(res=>{
        if(res.isConfirmed){
          window.open('https://search.google.com/local/writereview?placeid=ChIJFRctSC6LMW0Rd0T5nvajzPw','_blank');
        }
      });

    }catch(err){
      console.error(err);
      alert('Failed to copy review');
    }
  };

  $('backFromGoogleReview').onclick=()=>showStep('reviewSharePage');
  $('forwardFromGoogleReview').onclick=()=>showStep('finalOptionsPage');

  /* final options sync */
  const syncFinal=()=>{
    if(!$('finalOptionsPage').classList.contains('active'))return;
    $('finalVehicleShareImage').src=$('vehicleShareImage').src;
    $('finalReviewShareImage').src=$('reviewShareImage').src;
    $('finalReviewText').value=userReview;
  };
  new MutationObserver(syncFinal).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});

  /* initial share‑image update */
  updateShareImage();
});
