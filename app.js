(() => {
  "use strict";

  // ==========================================
  // ELEMENTS
  // ==========================================

  const $ = (selector) => document.querySelector(selector);

  const video = $("#camera");
  const canvas = $("#capture-canvas");
  const ctx = canvas?.getContext("2d");

  const placeholder = $("#camera-placeholder");
  const captureButton = $("#capture-button");
  const countdown = $("#countdown");
  const cameraWrap = video?.closest(".camera-wrap") || video?.parentElement;

  let flashTimer = null;

  if (cameraWrap && !cameraWrap.querySelector(".camera-status-light")) {
    const light = document.createElement("span");
    light.className = "camera-status-light";
    light.setAttribute("aria-hidden", "true");
    cameraWrap.appendChild(light);
  }

  function flashCameraLight() {
    const light = cameraWrap?.querySelector(".camera-status-light");
    if (!light) return;

    clearTimeout(flashTimer);
    light.classList.remove("is-flashing");

    // Restart the animation.
    void light.offsetWidth;

    light.classList.add("is-flashing");

    flashTimer = setTimeout(() => {
      light.classList.remove("is-flashing");
    }, 500);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function showPhotoCountdown() {
    if (!countdown) {
      await wait(3000);
      return;
    }

    for (let i = 3; i >= 1; i--) {
      if (!stream) return false;

      countdown.textContent = i;
      countdown.style.display = "grid";

      await wait(1000);
    }

    countdown.style.display = "none";
    return Boolean(stream);
  }
  // ==========================================
  // STATE
  // ==========================================

  const photos = [];

  let stream = null;
  let facingMode = "user";
  let photoCount = 4;
  let timerEnabled = false;
  let captureInProgress = false;
  let finalDataUrl = "";
  let finalCanvas = null;
  let toastTimer = null;
  let stripGeneration = 0;

  // ==========================================
  // FILTERS AND FRAMES
  // ==========================================

  const filterCss = {
    none: "none",
    soft: "brightness(1.06) saturate(.82) sepia(.08)",
    warm: "sepia(.22) saturate(1.18) brightness(1.04)",
    mono: "grayscale(1) contrast(1.08)",
    dreamy: "hue-rotate(12deg) saturate(.72) brightness(1.08)",
  };

  const frameColors = {
    cream: "#fff8f0",
    pink: "#f6dce5",
    lavender: "#e8e0f4",
    berry: "#9b526f",
  };

  // ==========================================
  // GENERAL HELPERS
  // ==========================================

  function toast(message) {
    const el = $("#toast");
    if (!el) return;

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 2600);
  }

  function getSelectedFilter() {
    return filterCss[$("#filter-select")?.value] || "none";
  }

  function applyPreviewFilter() {
    if (!video) return;

    const filter = getSelectedFilter();

    video.style.setProperty("filter", filter, "important");
    video.style.setProperty("-webkit-filter", filter, "important");
  }

  function invalidateStrip() {
    stripGeneration++;
    finalDataUrl = "";
    finalCanvas = null;

    const result = $("#result");
    if (result) result.hidden = true;
  }

  // ==========================================
  // CAMERA
  // ==========================================

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Camera access needs a supported browser and HTTPS.");
      return;
    }

    stopCamera();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      video.srcObject = stream;
      await video.play();

      video.classList.add("ready");
      cameraWrap?.classList.add("camera-active");
      applyPreviewFilter();

      if (placeholder) placeholder.hidden = true;
      if (captureButton) captureButton.disabled = false;

      toast("Camera is ready. Let's make some memories ♡");
    } catch (error) {
      console.warn("Camera error:", error);
      stream = null;

      const messages = {
        NotAllowedError:
          "Camera permission was blocked. Allow it in your browser settings.",
        NotFoundError: "No camera was found on this device.",
        NotReadableError: "Your camera may be in use by another app.",
        OverconstrainedError:
          "This camera does not support the requested settings.",
      };

      toast(
        messages[error.name] ||
          "We couldn't start the camera. Check permissions and try again.",
      );
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    if (video) {
      video.srcObject = null;
      video.classList.remove("ready");
      video.style.filter = "";
      video.style.webkitFilter = "";
    }
    cameraWrap?.classList.remove("camera-active");
    if (captureButton) captureButton.disabled = true;
    if (placeholder) placeholder.hidden = false;
  }

  // ==========================================
  // PHOTO PROGRESS AND THUMBNAILS
  // ==========================================

  function updateProgress() {
    const progress = $("#photo-progress");
    const fill = $("#progress-fill");
    const retakeButton = $("#retake-last");
    const makeButton = $("#make-strip");
    const grid = $("#thumbnail-grid");

    if (progress) {
      progress.textContent = `${photos.length} / ${photoCount}`;
    }

    if (fill) {
      fill.style.width = `${(photos.length / photoCount) * 100}%`;
    }

    if (retakeButton) {
      retakeButton.disabled = photos.length === 0;
    }

    if (makeButton) {
      makeButton.disabled = photos.length !== photoCount;
    }

    if (!grid) return;

    grid.replaceChildren();

    const selectedFilter = getSelectedFilter();

    for (let i = 0; i < photoCount; i++) {
      const cell = document.createElement("div");

      if (photos[i]) {
        cell.className = "thumb";

        const img = document.createElement("img");
        img.src = photos[i];
        img.alt = `Captured photo ${i + 1}`;

        // Apply the selected filter to each thumbnail.
        img.style.setProperty("filter", selectedFilter, "important");
        img.style.setProperty("-webkit-filter", selectedFilter, "important");

        cell.append(img);
      } else {
        cell.className = "empty-thumb";
        cell.textContent = "♡";
      }

      grid.append(cell);
    }
  }

  // ==========================================
  // CAPTURE PHOTO
  // ==========================================

  function capturePhoto() {
    if (!stream || !video || video.readyState < 2) {
      toast("Turn on your camera first ♡");
      return false;
    }

    if (photos.length >= photoCount) {
      return false;
    }

    if (!canvas || !ctx) {
      toast("Photo capture is unavailable. Please refresh the page.");
      return false;
    }

    const sourceW = video.videoWidth;
    const sourceH = video.videoHeight;

    const preview = video.getBoundingClientRect();
    const previewW = preview.width;
    const previewH = preview.height;

    if (!sourceW || !sourceH || !previewW || !previewH) {
      toast("Camera is still getting ready. Try again ♡");
      return false;
    }

    const previewRatio = previewW / previewH;
    const sourceRatio = sourceW / sourceH;

    let cropW = sourceW;
    let cropH = sourceH;

    if (sourceRatio > previewRatio) {
      cropW = sourceH * previewRatio;
    } else if (sourceRatio < previewRatio) {
      cropH = sourceW / previewRatio;
    }

    const cropX = (sourceW - cropW) / 2;
    const cropY = (sourceH - cropH) / 2;

    canvas.width = Math.max(1, Math.round(cropW));
    canvas.height = Math.max(1, Math.round(cropH));

    ctx.save();

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.filter = "none";

    ctx.drawImage(
      video,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    ctx.restore();

    photos.push(canvas.toDataURL("image/jpeg", 0.95));

    invalidateStrip();
    updateProgress();

    toast(`Snap ${photos.length} of ${photoCount}! ♡`);

    if (photos.length === photoCount) {
      $("#make-strip")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }

    return true;
  }

  // ==========================================
  // AUTOMATIC PHOTO SESSION
  // ==========================================

  async function takePhoto() {
    if (captureInProgress) return;

    if (!stream) {
      toast("Turn on your camera first ♡");
      return;
    }

    captureInProgress = true;

    if (captureButton) captureButton.disabled = true;

    try {
      toast("Get ready! Your photo session is starting ♡");

      while (photos.length < photoCount && stream) {
        const ready = await showPhotoCountdown();

        if (!ready || !stream) break;

        flashCameraLight();

        const success = capturePhoto();

        if (!success) break;

        await wait(900);
      }

      if (photos.length === photoCount) {
        if (countdown) countdown.style.display = "none";

        toast("All your photos are ready! Making your strip ♡");

        await wait(500);
        await buildStrip();
      }
    } catch (error) {
      console.error("Photo session error:", error);
      toast("Something went wrong during your photo session ♡");
    } finally {
      if (countdown) countdown.style.display = "none";

      captureInProgress = false;

      if (stream && photos.length < photoCount && captureButton) {
        captureButton.disabled = false;
      }
    }
  }

  // ==========================================
  // IMAGE HELPERS
  // ==========================================

  function roundedRect(context, x, y, w, h, r) {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
  }

  function loadPhoto(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = reject;

      img.src = dataUrl;
    });
  }

  // Captured photos already match the preview ratio.
  // Preserve their ratio when drawing them into the strip.
  function drawPhotoCover(context, image, x, y, width, height) {
    const imageW = image.naturalWidth || image.width;
    const imageH = image.naturalHeight || image.height;

    const imageRatio = imageW / imageH;
    const frameRatio = width / height;

    let sourceX = 0;
    let sourceY = 0;
    let sourceW = imageW;
    let sourceH = imageH;

    if (imageRatio > frameRatio) {
      sourceW = imageH * frameRatio;
      sourceX = (imageW - sourceW) / 2;
    } else if (imageRatio < frameRatio) {
      sourceH = imageW / frameRatio;
      sourceY = (imageH - sourceH) / 2;
    }

    context.save();

    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      x,
      y,
      width,
      height,
    );

    context.restore();
  }

  // ==========================================
  // FILTERED PHOTO
  // ==========================================

  function drawFilteredPhoto(context, image, x, y, width, height, filterName) {
    const scale = 2;

    const temp = document.createElement("canvas");
    temp.width = Math.max(1, Math.round(width * scale));
    temp.height = Math.max(1, Math.round(height * scale));

    const tempContext = temp.getContext("2d", {
      willReadFrequently: true,
    });

    if (!tempContext) {
      drawPhotoCover(context, image, x, y, width, height);
      return;
    }

    // Draw the correctly cropped photo first.
    drawPhotoCover(tempContext, image, 0, 0, temp.width, temp.height);

    const imageData = tempContext.getImageData(0, 0, temp.width, temp.height);

    const pixels = imageData.data;

    const clamp = (value) => Math.max(0, Math.min(255, value));

    function applyMatrix(matrix) {
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        pixels[i] = clamp(matrix[0] * r + matrix[1] * g + matrix[2] * b);

        pixels[i + 1] = clamp(matrix[3] * r + matrix[4] * g + matrix[5] * b);

        pixels[i + 2] = clamp(matrix[6] * r + matrix[7] * g + matrix[8] * b);
      }
    }

    function brightness(amount) {
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp(pixels[i] * amount);
        pixels[i + 1] = clamp(pixels[i + 1] * amount);
        pixels[i + 2] = clamp(pixels[i + 2] * amount);
      }
    }

    function contrast(amount) {
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = clamp((pixels[i] - 128) * amount + 128);
        pixels[i + 1] = clamp((pixels[i + 1] - 128) * amount + 128);
        pixels[i + 2] = clamp((pixels[i + 2] - 128) * amount + 128);
      }
    }

    function saturate(amount) {
      const lr = 0.213;
      const lg = 0.715;
      const lb = 0.072;
      const inverse = 1 - amount;

      applyMatrix([
        lr * inverse + amount,
        lg * inverse,
        lb * inverse,
        lr * inverse,
        lg * inverse + amount,
        lb * inverse,
        lr * inverse,
        lg * inverse,
        lb * inverse + amount,
      ]);
    }

    function sepia(amount) {
      const s = amount;
      const inverse = 1 - s;

      applyMatrix([
        inverse + 0.393 * s,
        0.769 * s,
        0.189 * s,
        0.349 * s,
        inverse + 0.686 * s,
        0.168 * s,
        0.272 * s,
        0.534 * s,
        inverse + 0.131 * s,
      ]);
    }

    function hueRotate(degrees) {
      const angle = (degrees * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      applyMatrix([
        0.213 + cos * 0.787 - sin * 0.213,
        0.715 - cos * 0.715 - sin * 0.715,
        0.072 - cos * 0.072 + sin * 0.928,

        0.213 - cos * 0.213 + sin * 0.143,
        0.715 + cos * 0.285 + sin * 0.14,
        0.072 - cos * 0.072 - sin * 0.283,

        0.213 - cos * 0.213 - sin * 0.787,
        0.715 - cos * 0.715 + sin * 0.715,
        0.072 + cos * 0.928 + sin * 0.072,
      ]);
    }

    // Apply the selected effect directly to the photo pixels.
    switch (filterName) {
      case "soft":
        brightness(1.06);
        saturate(0.82);
        sepia(0.08);
        break;

      case "warm":
        sepia(0.22);
        saturate(1.18);
        brightness(1.04);
        break;

      case "mono":
        saturate(0);
        contrast(1.08);
        break;

      case "dreamy":
        hueRotate(12);
        saturate(0.72);
        brightness(1.08);
        break;

      case "none":
      default:
        break;
    }

    tempContext.putImageData(imageData, 0, 0);

    // Place the processed pixels on the final strip.
    context.drawImage(temp, 0, 0, temp.width, temp.height, x, y, width, height);
  }

  // ==========================================
  // PHOTO STICKERS
  // ==========================================

  function drawPhotoSticker(context, sticker, x, y, width, height, index) {
    if (!sticker) return;

    const positions = [
      { x: 0.82, y: 0.18, angle: 0.12 },
      { x: 0.18, y: 0.22, angle: -0.12 },
      { x: 0.82, y: 0.78, angle: -0.1 },
      { x: 0.18, y: 0.78, angle: 0.1 },
    ];

    const position = positions[index % positions.length];

    const stickerSize = Math.max(27, Math.min(43, width * 0.13));

    const centerX = x + width * position.x;
    const centerY = y + height * position.y;

    context.save();

    context.translate(centerX, centerY);
    context.rotate(position.angle);

    context.textAlign = "center";
    context.textBaseline = "middle";

    context.font = `${stickerSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", Georgia`;

    context.shadowColor = "rgba(70, 40, 50, .3)";
    context.shadowBlur = 5;
    context.shadowOffsetY = 2;

    context.fillText(sticker, 0, 0);

    context.restore();
  }

  // ==========================================
  // BUILD PHOTO STRIP
  // ==========================================

  async function buildStrip() {
    if (photos.length !== photoCount) {
      toast("Take all your photos before creating your strip ♡");
      return;
    }

    const generation = ++stripGeneration;

    const width = 720;
    const margin = 34;
    const gap = 18;
    const inset = 9;

    const caption = $("#caption-input")?.value.trim() || "a day to remember ♡";

    const sticker = $("#sticker-select")?.value || "";
    const frame = $("#frame-select")?.value || "cream";
    const selectedFilter = $("#filter-select")?.value || "none";

    const headerH = 62;
    const footerH = 100;

    const twoColumn = photoCount === 6 || photoCount === 8;
    const rows = twoColumn ? photoCount / 2 : photoCount;
    const columns = twoColumn ? 2 : 1;

    const contentWidth = width - margin * 2;
    const columnGap = twoColumn ? 18 : 0;

    const photoW = (contentWidth - columnGap * (columns - 1)) / columns;
    const imageW = photoW - inset * 2;

    let loadedPhotos;

    try {
      loadedPhotos = await Promise.all(photos.map(loadPhoto));
    } catch (error) {
      console.error(error);
      toast("One of your photos couldn't be loaded ♡");
      return;
    }

    if (generation !== stripGeneration) return;

    // Preserve each photo's original captured aspect ratio.
    const photoHeights = loadedPhotos.map((img) => {
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      return Math.round((imageW * imgH) / imgW + inset * 2);
    });

    const columnHeights = Array(columns).fill(0);

    loadedPhotos.forEach((img, i) => {
      const column = twoColumn ? Math.floor(i / rows) : 0;

      columnHeights[column] += photoHeights[i];

      const isLastInColumn = twoColumn
        ? i % rows === rows - 1
        : i === loadedPhotos.length - 1;

      if (!isLastInColumn) {
        columnHeights[column] += gap;
      }
    });

    const contentHeight = Math.max(...columnHeights);
    const height = margin * 2 + headerH + contentHeight + footerH;

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;

    const c = out.getContext("2d");

    if (!c) {
      toast("We couldn't create your strip ♡");
      return;
    }

    // Background.
    c.fillStyle = frameColors[frame] || frameColors.cream;
    c.fillRect(0, 0, width, height);

    // Header.
    c.fillStyle = frame === "berry" ? "#fff8f0" : "#9b526f";
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.font = "600 27px Georgia";
    c.fillText("filmie ♡", width / 2, margin + 30);

    const columnY = Array(columns).fill(margin + headerH);

    // Draw photographs.
    for (let i = 0; i < loadedPhotos.length; i++) {
      if (generation !== stripGeneration) return;

      const img = loadedPhotos[i];
      const column = twoColumn ? Math.floor(i / rows) : 0;

      const x = margin + column * (photoW + columnGap);
      const y = columnY[column];
      const photoH = photoHeights[i];

      // White photo border.
      c.save();

      c.shadowColor = "rgba(70, 40, 50, .16)";
      c.shadowBlur = 12;
      c.fillStyle = "#fffdfb";

      roundedRect(c, x, y, photoW, photoH, 6);
      c.fill();

      c.restore();

      const imageX = x + inset;
      const imageY = y + inset;
      const imageH = photoH - inset * 2;

      c.save();

      roundedRect(c, imageX, imageY, imageW, imageH, 3);
      c.clip();

      // Apply the selected filter to the actual photo pixels.
      drawFilteredPhoto(c, img, imageX, imageY, imageW, imageH, selectedFilter);

      // Stickers appear over the actual photographs.
      drawPhotoSticker(c, sticker, imageX, imageY, imageW, imageH, i);

      c.restore();

      columnY[column] += photoH + gap;
    }

    // Footer.
    c.fillStyle = frame === "berry" ? "#fff8f0" : "#72545a";
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.font = "italic 24px Georgia";

    c.fillText(caption, width / 2, height - margin - 42);

    const date = new Date();

    const dateText = [
      String(date.getDate()).padStart(2, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getFullYear()).slice(-2),
    ].join(" · ");

    c.font = "18px Georgia";

    c.fillText(`✧  ${dateText}  ✧`, width / 2, height - margin - 10);

    // Export.
    try {
      finalDataUrl = out.toDataURL("image/png");
      finalCanvas = out;
    } catch (error) {
      console.error(error);
      toast("We couldn't export your strip ♡");
      return;
    }

    const enlargedImage = $("#enlarged-image");
    const finalImage = $("#final-image");
    const result = $("#result");

    if (enlargedImage) enlargedImage.src = finalDataUrl;
    if (finalImage) finalImage.src = finalDataUrl;
    if (result) result.hidden = false;

    result?.scrollIntoView({ behavior: "smooth" });

    const output = $("#print-output");

    if (output) {
      output.classList.add("printing");

      setTimeout(() => {
        output.classList.remove("printing");
      }, 700);
    }

    toast("Your photo strip is ready! ♡");
  }

  // ==========================================
  // DOWNLOAD PNG
  // ==========================================

  function downloadStrip(event) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!finalCanvas || !finalDataUrl) {
      toast("Create your photo strip first ♡");
      return;
    }

    try {
      const binary = atob(finalDataUrl.split(",")[1]);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: "image/png" });
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = "filmie-photo-strip.png";
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

      toast("Your photo strip download has started ♡");
    } catch (error) {
      console.error("Download error:", error);

      window.open(finalDataUrl, "_blank");

      toast("Your strip opened in a new tab. Save the image from there.");
    }
  }

  // ==========================================
  // PRINT
  // ==========================================

  function printStrip(event) {
    event?.preventDefault();

    if (!finalDataUrl) {
      toast("Create your photo strip first ♡");
      return;
    }

    document.body.classList.add("printing-only");
    window.print();
  }

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-only");
  });

  // ==========================================
  // START BUTTON
  // ==========================================

  $("#start-button")?.addEventListener("click", () => {
    $("#studio")?.scrollIntoView({ behavior: "smooth" });

    if (!stream) startCamera();
  });

  // ==========================================
  // ENABLE CAMERA
  // ==========================================

  $("#enable-camera")?.addEventListener("click", startCamera);

  // ==========================================
  // SWITCH CAMERA
  // ==========================================

  $("#switch-camera")?.addEventListener("click", async () => {
    facingMode = facingMode === "user" ? "environment" : "user";

    if (stream) {
      await startCamera();
    } else {
      toast("Camera preference changed. Turn on your camera when ready.");
    }
  });

  // ==========================================
  // CAPTURE BUTTON
  // ==========================================

  captureButton?.addEventListener("click", takePhoto);

  // ==========================================
  // COUNTDOWN
  // ==========================================

  $("#timer-button")?.addEventListener("click", (event) => {
    timerEnabled = !timerEnabled;

    event.currentTarget.setAttribute("aria-pressed", String(timerEnabled));

    event.currentTarget.style.background = timerEnabled ? "#f4dfe7" : "white";

    toast(
      timerEnabled ? "3-second countdown is on ♡" : "Countdown turned off.",
    );
  });

  // ==========================================
  // PHOTO COUNT
  // ==========================================

  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => {
      const newCount = Number(button.dataset.count);

      if (![4, 6, 8].includes(newCount)) return;
      if (newCount === photoCount) return;

      if (photos.length) {
        const ok = window.confirm(
          "Changing the photo count will clear this session. Continue?",
        );

        if (!ok) return;

        photos.length = 0;
      }

      photoCount = newCount;

      document.querySelectorAll(".choice").forEach((item) => {
        const active = item === button;

        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });

      invalidateStrip();
      updateProgress();

      toast(`${photoCount} photos selected. Let's go ♡`);
    });
  });

  // ==========================================
  // FILTER
  // ==========================================

  $("#filter-select")?.addEventListener("change", async () => {
    applyPreviewFilter();
    updateProgress();

    if (photos.length === photoCount && photos.length > 0) {
      await buildStrip();
    } else {
      invalidateStrip();
    }
  });

  // ==========================================
  // FRAME AND STICKER
  // ==========================================

  $("#frame-select")?.addEventListener("change", () => {
    if (photos.length === photoCount && photos.length > 0) {
      buildStrip();
    }
  });

  $("#sticker-select")?.addEventListener("change", () => {
    if (photos.length === photoCount && photos.length > 0) {
      buildStrip();
    }
  });

  // ==========================================
  // CAPTION
  // ==========================================

  $("#caption-input")?.addEventListener("input", () => {
    if (photos.length === photoCount && photos.length > 0) {
      buildStrip();
    }
  });

  // ==========================================
  // RETAKE LAST PHOTO
  // ==========================================

  $("#retake-last")?.addEventListener("click", () => {
    if (!photos.length) return;

    photos.pop();

    invalidateStrip();
    updateProgress();

    if (stream && captureButton) {
      captureButton.disabled = false;
    }

    toast("Last snap removed. Ready for another!");
  });

  // ==========================================
  // CREATE / UPDATE STRIP
  // ==========================================

  $("#make-strip")?.addEventListener("click", (event) => {
    event.preventDefault();
    buildStrip();
  });

  $("#update-strip")?.addEventListener("click", (event) => {
    event.preventDefault();
    buildStrip();
  });

  // ==========================================
  // DOWNLOAD AND PRINT BUTTONS
  // ==========================================

  $("#download-png")?.addEventListener("click", downloadStrip);
  $("#print-strip")?.addEventListener("click", printStrip);

  // ==========================================
  // START AGAIN
  // ==========================================

  $("#start-again")?.addEventListener("click", (event) => {
    event.preventDefault();

    photos.length = 0;

    invalidateStrip();

    const caption = $("#caption-input");
    const sticker = $("#sticker-select");

    if (caption) caption.value = "";
    if (sticker) sticker.value = "";

    updateProgress();

    $("#studio")?.scrollIntoView({ behavior: "smooth" });

    toast("A fresh little session. Let's go!");
  });

  // ==========================================
  // ENLARGED PREVIEW
  // ==========================================

  $("#print-output")?.addEventListener("click", () => {
    if (!finalDataUrl) return;

    const dialog = $("#preview-dialog");
    const enlargedImage = $("#enlarged-image");

    if (!dialog || !enlargedImage) return;

    enlargedImage.src = finalDataUrl;

    if (!dialog.open) {
      dialog.showModal();
    }
  });

  $("#close-preview")?.addEventListener("click", () => {
    $("#preview-dialog")?.close();
  });

  $("#preview-dialog")?.addEventListener("click", (event) => {
    if (event.target === $("#preview-dialog")) {
      $("#preview-dialog").close();
    }
  });

  // ==========================================
  // CAMERA CLEANUP
  // ==========================================

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopCamera();
    }
  });

  window.addEventListener("pagehide", stopCamera);

  // ==========================================
  // INITIAL SETUP
  // ==========================================

  updateProgress();
  applyPreviewFilter();
})();
