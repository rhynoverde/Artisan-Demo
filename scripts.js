/*  scripts.js  – Artisan Demo  (Version d-3.1.3)  */

const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632';
const FINAL_WIDTH   = 1080;
const FINAL_HEIGHT  = 700;
const ASPECT_RATIO  = FINAL_WIDTH / FINAL_HEIGHT;

const TEMPLATE_URL        = 'https://my.reviewshare.pics/i/31TmFySPG.png?';
const REVIEW_TEMPLATE_URL = 'https://my.reviewshare.pics/i/FydUOQzdg.png?';

let uploadedVehicleUrl = '';
let userReview         = '';
let selectedRating     = 0;
let cropper            = null;
let cameraStream       = null;
let currentCamera      = 'environment';
let currentScale       = 1;

/* ── helpers ────────────────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const qs = sel => document.querySelector(sel);
const qa = sel => document.querySelectorAll(sel);

async function uploadToImgbb(dataUrl){
  const res = await fetch('https://api.imgbb.com/1/upload',{
    method:'POST',
    body:new URLSearchParams({key:IMGBB_API_KEY,image:dataUrl.split(',')[1]})
  });
  if(!res.ok) throw new Error(await res.text());
  return (await res.json()).data.display_url;
}

function showStep(id){
  qa('.step').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  if(id==='vehicleSharePage') updateShareImage();
}

/* ── customise text ─────────────────────────────────────────────────── */
function updateShareImage(){
  let txt = $('customTextSelect').value;
  if(txt==='custom') txt = $('customTextInput').value.trim().slice(0,20);
  const qs = new URLSearchParams({custom_text_1:txt,custom_image_1:uploadedVehicleUrl});
  $('vehicleShareImage').src = TEMPLATE_URL + qs.toString();
}

/* ── star rating UI ─────────────────────────────────────────────────── */
function initStarRating(){
  const stars = qa('#reviewStarRating span');
  function draw(val){stars.forEach(s=>s.classList.toggle('selected',+s.dataset.value<=val));}
  stars.forEach(star=>{
    const v = +star.dataset.value;
    star.addEventListener('click',   ()=>{selectedRating=v;draw(v)});
    star.addEventListener('mouseover',()=>draw(v));
    star.addEventListener('mouseout', ()=>draw(selectedRating));
  });
}

/* ── CAMERA + pinch-zoom ───────────────────────────────────────────── */
const activePointers=new Map();
function initPinchZoom(video){
  activePointers.clear(); let startDist=0,startScale=currentScale;
  const z=$('zoomIndicator');
  video.onpointerdown=e=>{
    activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activePointers.size===2){
      const [p1,p2]=activePointers.values();
      startDist=Math.hypot(p1.x-p2.x,p1.y-p2.y); startScale=currentScale;
    }
  };
  video.onpointermove=e=>{
    if(!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activePointers.size===2){
      const [p1,p2]=activePointers.values();
      const dist=Math.hypot(p1.x-p2.x,p1.y-p2.y);
      currentScale=startScale*(dist/startDist);
      video.style.transform=`scale(${currentScale})`;
      if(z){z.style.display='block';z.textContent=dist>startDist?'Zooming In…':'Zooming Out…';}
    }
  };
  ['pointerup','pointercancel'].forEach(evt=>
    video.addEventListener(evt,e=>{
      activePointers.delete(e.pointerId);
      if(activePointers.size<2&&z) z.style.display='none';
    }));
}

function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
  const v=$('cameraPreview'); if(v) v.srcObject=null;
}
function startCamera(){
  stopCamera();
  const v=$('cameraPreview'); currentScale=1; if(v) v.style.transform='scale(1)';
  if(!navigator.mediaDevices?.getUserMedia){alert('Camera not available');return;}
  navigator.mediaDevices.getUserMedia({video:{facingMode:currentCamera}})
    .then(stream=>{
      cameraStream=stream; v.srcObject=stream; v.play().catch(()=>{});
      initPinchZoom(v);
    })
    .catch(()=>alert('Camera access denied'));
}

/* ── capture & crop ─────────────────────────────────────────────────── */
function captureFromCamera(){
  const v=$('cameraPreview'); if(!v) return;
  const CW=2160,CH=1400;
  const full=document.createElement('canvas'); full.width=CW; full.height=CH;
  const ctx=full.getContext('2d');
  const sc=Math.max(CW/v.videoWidth,CH/v.videoHeight);
  const w=v.videoWidth*sc,h=v.videoHeight*sc,dx=(CW-w)/2,dy=(CH-h)/2;
  ctx.drawImage(v,0,0,v.videoWidth,v.videoHeight,dx,dy,w,h);

  const crop=document.createElement('canvas'); crop.width=FINAL_WIDTH;crop.height=FINAL_HEIGHT;
  crop.getContext('2d').drawImage(full,0,0,CW,CH,0,0,FINAL_WIDTH,FINAL_HEIGHT);

  stopCamera();
  uploadToImgbb(crop.toDataURL('image/jpeg'))
    .then(url=>{uploadedVehicleUrl=url;showStep('vehicleSharePage');})
    .catch(err=>alert(err));
}

function loadImageForCrop(src,isUrl=false){
  const img=$('cropImage'); if(isUrl) img.crossOrigin='Anonymous'; img.src=src;
  qa('.photo-section').forEach(s=>s.style.display='none'); $('cropSection').style.display='block';
  cropper?.destroy();
  cropper = new Cropper(img,{aspectRatio:ASPECT_RATIO,viewMode:1,autoCropArea:0.8,movable:true,zoomable:true,cropBoxResizable:false,cropBoxMovable:false});
}

/* ── QR helper ─────────────────────────────────────────────────────── */
function showQRPage(){
  $('qrCodeImage').src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data='+encodeURIComponent('justshar.ing/xyz');
  showStep('qrSharePage');
}

/* ── DOMContentLoaded main block ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{

  /* random preset */
  const sel=$('customTextSelect');
  const presets=[...sel.options].filter(o=>o.value!=='custom');
  sel.value=presets[Math.floor(Math.random()*presets.length)].value;
  updateShareImage();

  /* customise text */
  const customInput=$('customTextInput'),applyBtn=$('applyTextButton');
  customInput.style.display='none';applyBtn.style.display='none';
  sel.addEventListener('change',()=>{
    const isCustom=sel.value==='custom';
    customInput.style.display=isCustom?'block':'none';
    applyBtn  .style.display=isCustom?'inline-block':'none';
    if(!isCustom) updateShareImage(); else customInput.focus();
  });
  applyBtn.addEventListener('click',updateShareImage);

  /* intro */
  $('takePhotoButton').addEventListener('click',()=>{
    showStep('step2');$('photoOptions').style.display='none';qa('.photo-section').forEach(s=>s.style.display='none');
    $('takePhotoSection').style.display='block';startCamera();
  });
  $('uploadPhotoButton').addEventListener('click',()=>{
    showStep('step2');$('photoOptions').style.display='none';qa('.photo-section').forEach(s=>s.style.display='none');
    $('uploadPhotoSection').style.display='block';
  });

  /* step-2 options */
  qa('#photoOptions .photo-option').forEach(btn=>btn.addEventListener('click',()=>{
    $('photoOptions').style.display='none';qa('.photo-section').forEach(s=>s.style.display='none');
    const opt=btn.dataset.option;
    if(opt==='take'){ $('takePhotoSection').style.display='block';startCamera(); }
    else if(opt==='upload'){ $('uploadPhotoSection').style.display='block'; }
    else { $('urlPhotoSection').style.display='block'; }
  }));
  qa('.backToOptions').forEach(b=>b.addEventListener('click',()=>{
    stopCamera();$('photoOptions').style.display='block';qa('.photo-section').forEach(s=>s.style.display='none');
  }));

  /* file / URL */
  $('uploadInput').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=ev=>loadImageForCrop(ev.target.result);r.readAsDataURL(f);
  });
  $('loadUrlImage').addEventListener('click',()=>{
    const url=$('imageUrlInput').value.trim();if(!url)return alert('Enter a valid URL');loadImageForCrop(url,true);
  });

  /* camera controls */
  $('capturePhoto').addEventListener('click',captureFromCamera);
  $('swapCamera').addEventListener('click',()=>{currentCamera=currentCamera==='environment'?'user':'environment';startCamera();});
  $('flashToggle').addEventListener('click',e=>{
    if(!cameraStream)return;const track=cameraStream.getVideoTracks()[0];
    if(!track.getCapabilities().torch)return;
    const on=e.currentTarget.classList.toggle('flash-on');track.applyConstraints({advanced:[{torch:on}]});
  });

  /* crop buttons */
  $('cropButton').addEventListener('click',()=>{
    if(!cropper)return;
    const c=cropper.getCroppedCanvas({width:FINAL_WIDTH,height:FINAL_HEIGHT});
    cropper.destroy();cropper=null;
    uploadToImgbb(c.toDataURL('image/jpeg'))
      .then(url=>{uploadedVehicleUrl=url;showStep('vehicleSharePage');})
      .catch(err=>alert(err));
  });
  $('fitEntireButton').addEventListener('click',()=>{
    const img=new Image();img.crossOrigin='Anonymous';
    img.onload=()=>{
      const cnv=document.createElement('canvas');cnv.width=FINAL_WIDTH;cnv.height=FINAL_HEIGHT;
      const ctx=cnv.getContext('2d');
      const scCover=Math.max(FINAL_WIDTH/img.width,FINAL_HEIGHT/img.height);
      ctx.filter='blur(40px)';
      ctx.drawImage(img,(FINAL_WIDTH-img.width*scCover)/2,(FINAL_HEIGHT-img.height*scCover)/2,img.width*scCover,img.height*scCover);
      ctx.filter='none';
      const scFit=Math.min(FINAL_WIDTH/img.width,FINAL_HEIGHT/img.height);
      ctx.drawImage(img,(FINAL_WIDTH-img.width*scFit)/2,(FINAL_HEIGHT-img.height*scFit)/2,img.width*scFit,img.height*scFit);
      uploadToImgbb(cnv.toDataURL('image/jpeg'))
        .then(url=>{uploadedVehicleUrl=url;showStep('vehicleSharePage');})
        .catch(err=>alert(err));
    };
    img.src=uploadedVehicleUrl;
  });
  $('changePhoto').addEventListener('click',()=>{stopCamera();$('photoOptions').style.display='block';qa('.photo-section').forEach(s=>s.style.display='none');});

  /* ── VEHICLE SHARE PAGE ─────────────────────────────────────────── */
  $('shareNowButton').addEventListener('click',async ()=>{
    const link='https://www.etsy.com/listing/1088793681/willow-and-wood-signature-scented-soy';
    try{
      await navigator.clipboard.writeText(link);
      Swal.fire({
        title:'Contact Link Saved to Clipboard!',
        html:'<p>Paste the link anywhere you post this image.</p>',
        icon:'success',showCancelButton:true,
        confirmButtonText:'Got it!, Share Image Now',cancelButtonText:'More Instructions'
      }).then(async res=>{
        if(res.isConfirmed && navigator.share){
          const blob=await (await fetch($('vehicleShareImage').src)).blob();
          await navigator.share({files:[new File([blob],'product.jpg',{type:blob.type})]});
        }else if(res.dismiss===Swal.DismissReason.cancel){
          alert('For more instructions, please check our guidelines.');
        }
      });
    }catch{alert('Failed to copy link');}
  });
  $('forwardFromVehicleShare').addEventListener('click',()=>{showStep('reviewFormPage');initStarRating();});
  $('backFromVehicleShare').addEventListener('click',()=>showStep('step2'));

  /* ── REVIEW FORM PAGE ───────────────────────────────────────────── */
  initStarRating();
  $('submitReviewForm').addEventListener('click',()=>{
    const txt=$('reviewText').value.trim();const name=$('reviewerName').value.trim();
    if(!txt||!name) return alert('Please enter both name and review.');
    userReview=txt;
    const url=REVIEW_TEMPLATE_URL+'first_name='+encodeURIComponent(name)+'&job_title='+encodeURIComponent(txt);
    $('reviewShareImage').src=url;showStep('reviewSharePage');
  });
  $('backFromReviewForm').addEventListener('click',()=>showStep('vehicleSharePage'));

  /* ── REVIEW SHARE PAGE ─────────────────────────────────────────── */
  $('reviewShareButton').addEventListener('click',async ()=>{
    try{
      await navigator.clipboard.writeText('https://www.etsy.com/listing/1088793681/willow-and-wood-signature-scented-soy');
      Swal.fire({
        title:'Contact Link Saved!',
        html:'<p>Paste the link when you post the image.</p>',
        icon:'success',showCancelButton:true,
        confirmButtonText:'Got it!, Share Image Now',cancelButtonText:'More Instructions'
      }).then(async res=>{
        if(res.isConfirmed && navigator.share){
          const blob=await (await fetch($('reviewShareImage').src)).blob();
          await navigator.share({files:[new File([blob],'review.jpg',{type:blob.type})]});
        }else if(res.dismiss===Swal.DismissReason.cancel){
          alert('For more instructions, please check our guidelines.');
        }
      });
    }catch{alert('Failed to copy link');}
  });
  $('forwardFromReviewShare').addEventListener('click',()=>showStep('googleReviewPage'));
  $('backFromReviewShare').addEventListener('click',()=>{showStep('reviewFormPage');initStarRating();});

  /* ── GOOGLE REVIEW PAGE ─────────────────────────────────────────── */
  $('googleReviewButton').addEventListener('click',async ()=>{
    try{
      await navigator.clipboard.writeText($('reviewText').value.trim());
      Swal.fire({
        title:'Review Copied!',
        html:'<p>Your review is on the clipboard. Paste it on Google.</p>',
        icon:'info',confirmButtonText:'Open Google'
      }).then(()=>{
        window.open('https://search.google.com/local/writereview?placeid=ChIJFRctSC6LMW0Rd0T5nvajzPw','_blank');
        setTimeout(()=>showStep('finalOptionsPage'),1000);
      });
    }catch{alert('Failed to copy review');}
  });
  $('backFromGoogleReview').addEventListener('click',()=>showStep('reviewSharePage'));
  $('forwardFromGoogleReview').addEventListener('click',()=>showStep('finalOptionsPage'));

  /* ── FINAL OPTIONS PAGE ─────────────────────────────────────────── */
  $('shareVehicleFinalButton').addEventListener('click',()=>navigator.clipboard.writeText('https://GetMy.Deal/WillowAndWhimsy'));
  $('shareReviewFinalButton' ).addEventListener('click',()=>navigator.clipboard.writeText('https://GetMy.Deal/WillowAndWhimsy'));
  $('copyReviewText').addEventListener('click',()=>navigator.clipboard.writeText($('finalReviewText').value.trim()));
  $('textLinkFinal').addEventListener('click',()=>alert('Text sent!'));
  $('emailLinkFinal').addEventListener('click',()=>alert('Email sent!'));
  $('backFromFinalOptions').addEventListener('click',()=>showStep('googleReviewPage'));

  /* ── QR PAGE ────────────────────────────────────────────────────── */
  $('backFromQR').addEventListener('click',()=>showStep('vehicleSharePage'));

  /* keep final-options content fresh */
  const obs=new MutationObserver(()=>{
    if(!$('finalOptionsPage').classList.contains('active')) return;
    $('finalVehicleShareImage').src=$('vehicleShareImage').src;
    $('finalReviewShareImage').src=$('reviewShareImage').src;
    $('finalReviewText').value=userReview;
  });
  obs.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
});
