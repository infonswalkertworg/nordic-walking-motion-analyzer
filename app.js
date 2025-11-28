// North Star Walker Taiwan Nordic Walking Motion Analyzer - Multi-Angle View
const app = {
  // State
  currentView: 'front',
  showGroundLine: true,
  showVerticalLine: true,
  showSkeleton: true,
  showCoM: true,
  showPoles: true,
  isAnalyzing: false,
  isCameraActive: false,
  isPlaying: false,
  currentSpeed: 1,
  isVideoMode: false,
  diagnosisComplete: false,
  poseModelLoaded: false,
  poseModelLoading: false,
  poseLoadError: null,
  
  // Video elements
  videoElement: null,
  canvasElement: null,
  canvasCtx: null,
  camera: null,
  
  // MediaPipe Pose
  pose: null,
  
  // Current pose data
  currentPose: null,
  
  // Center of Mass tracking
  comPosition: null,
  comTrail: [],
  
  // Statistics tracking
  angleStats: {},
  
  // Grip detection tracking
  gripStats: {
    left: {
      forwardSwing: { gripping: 0, total: 0, consistency: 0 },
      backwardSwing: { open: 0, total: 0, consistency: 0 },
      currentPhase: 'unknown',
      currentGrip: 'unknown',
      handOpenness: 0
    },
    right: {
      forwardSwing: { gripping: 0, total: 0, consistency: 0 },
      backwardSwing: { open: 0, total: 0, consistency: 0 },
      currentPhase: 'unknown',
      currentGrip: 'unknown',
      handOpenness: 0
    },
    coordination: { synchronized: 0, total: 0, percentage: 0 }
  },
  strideStats: {
    current: 0,
    max: 0,
    min: Infinity,
    values: [],
    average: 0
  },
  lastFootPositions: { left: null, right: null },
  pixelsPerCm: 5, // Default calibration (will be adjusted)
  currentFrame: 0,
  lastProcessedFrame: -1,
  
  // Viewing angle configurations
  viewConfigs: {
    front: {
      label: '正面',
      icon: '👤',
      angles: [
        { key: 'armSwing', label: '手臂揮動', range: [60, 90] },
        { key: 'shoulderRotation', label: '肩膀轉動', range: [30, 45] },
        { key: 'trunkLean', label: '軀幹傾斜', range: [5, 15] }
      ],
      connections: [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]]
    },
    back: {
      label: '背面',
      icon: '🔄',
      angles: [
        { key: 'armSwing', label: '手臂揮動', range: [60, 90] },
        { key: 'shoulderRotation', label: '肩膀轉動', range: [30, 45] },
        { key: 'hipExtension', label: '臀部伸展', range: [25, 40] }
      ],
      connections: [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26], [25,27], [26,28]]
    },
    left: {
      label: '左側',
      icon: '◀️',
      angles: [
        { key: 'frontSwingAngle', label: '前擺臂角度', range: [45, 75] },
        { key: 'backSwingAngle', label: '後擺臂角度', range: [45, 75] },
        { key: 'lateralTrunkLean', label: '側向軀幹傾斜', range: [5, 15] }
      ],
      connections: [[11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [25,27], [24,26], [26,28]]
    },
    right: {
      label: '右側',
      icon: '▶️',
      angles: [
        { key: 'frontSwingAngle', label: '前擺臂角度', range: [45, 75] },
        { key: 'backSwingAngle', label: '後擺臂角度', range: [45, 75] },
        { key: 'lateralTrunkLean', label: '側向軀幹傾斜', range: [5, 15] }
      ],
      connections: [[11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [25,27], [24,26], [26,28]]
    }
  },
  
  // Initialize the app
  init() {
    this.canvasElement = document.getElementById('outputCanvas');
    this.canvasCtx = this.canvasElement.getContext('2d');
    this.ratioBox = document.getElementById('ratioBox');
    this.updateCanvasContainerAspectRatio(16, 9); // Default aspect ratio
    
    // Initialize statistics
    this.initializeStats();
    
    // Run diagnostics (with timeout)
    this.runDiagnosticsWithTimeout();
    
    // Input buttons are immediately clickable
    this.updateStatus('準備中...');
  },
  
  // Initialize statistics tracking
  initializeStats() {
    const allViews = Object.keys(this.viewConfigs);
    allViews.forEach(view => {
      this.viewConfigs[view].angles.forEach(angleConfig => {
        const key = angleConfig.key;
        this.angleStats[key] = {
          current: 0,
          max: 0,
          min: Infinity,
          values: [],
          average: 0
        };
      });
    });
  },
  
  // Run diagnostics with timeout mechanism
  async runDiagnosticsWithTimeout() {
    const totalTimeout = 5000; // 5 second max
    const startTime = Date.now();
    
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ timedOut: true });
      }, totalTimeout);
    });
    
    const diagPromise = this.runDiagnostics();
    
    const result = await Promise.race([diagPromise, timeoutPromise]);
    
    if (result && result.timedOut) {
      this.showSimplifiedMode();
    } else {
      // Auto-dismiss after successful completion
      setTimeout(() => {
        this.hideDiagnosticsPanel();
      }, 3000);
    }
  },
  
  // Show simplified mode when diagnostics timeout
  showSimplifiedMode() {
    const statusDiv = document.getElementById('diagnosticsStatus');
    statusDiv.innerHTML = '<strong style="color: var(--color-warning);">⚠️ 簡化模式</strong> - 部分檢查超時，但應用程式可正常使用';
    this.diagnosisComplete = true;
    this.updateStatus('簡化模式 - 就緒');
  },
  
  // Hide diagnostics panel
  hideDiagnosticsPanel() {
    const panel = document.getElementById('diagnosticsPanel');
    if (panel) {
      panel.style.display = 'none';
    }
    this.diagnosisComplete = true;
    this.updateStatus('就緒');
  },
  
  // Skip diagnosis and proceed to app
  skipDiagnosis() {
    this.hideDiagnosticsPanel();
  },
  
  // Run Android compatibility diagnostics
  async runDiagnostics() {
    const diagBrowser = document.getElementById('diagBrowser');
    const diagFileInput = document.getElementById('diagFileInput');
    const diagCamera = document.getElementById('diagCamera');
    const diagRecommended = document.getElementById('diagRecommended');
    
    // Browser detection (with timeout)
    const checkTimeout = 2000;
    
    const browserCheck = new Promise((resolve) => {
      setTimeout(() => {
        try {
          const userAgent = navigator.userAgent;
          const isAndroid = /Android/i.test(userAgent);
          const isChrome = /Chrome/i.test(userAgent);
          const isFirefox = /Firefox/i.test(userAgent);
          
          if (isAndroid) {
            diagBrowser.textContent = `✓ Android ${isChrome ? 'Chrome' : isFirefox ? 'Firefox' : '瀏覽器'}`;
            diagBrowser.className = 'diagnostic-value success';
          } else {
            diagBrowser.textContent = '✓ 桌面瀏覽器';
            diagBrowser.className = 'diagnostic-value success';
          }
          resolve(true);
        } catch (error) {
          diagBrowser.textContent = '✗ 檢查失敗';
          diagBrowser.className = 'diagnostic-value error';
          resolve(false);
        }
      }, 100);
    });
    
    await Promise.race([browserCheck, new Promise(r => setTimeout(() => {
      diagBrowser.textContent = '✗ 超時';
      diagBrowser.className = 'diagnostic-value error';
      r(false);
    }, checkTimeout))]);
    
    // File input support (with timeout)
    const fileCheck = new Promise((resolve) => {
      setTimeout(() => {
        try {
          const supportsFileInput = 'FileReader' in window;
          diagFileInput.textContent = supportsFileInput ? '✓ 支援' : '✗ 不支援';
          diagFileInput.className = supportsFileInput ? 'diagnostic-value success' : 'diagnostic-value error';
          resolve(supportsFileInput);
        } catch (error) {
          diagFileInput.textContent = '✗ 檢查失敗';
          diagFileInput.className = 'diagnostic-value error';
          resolve(false);
        }
      }, 100);
    });
    
    await Promise.race([fileCheck, new Promise(r => setTimeout(() => {
      diagFileInput.textContent = '✗ 超時';
      diagFileInput.className = 'diagnostic-value error';
      r(false);
    }, checkTimeout))]);
    
    // Camera access check (with timeout)
    const cameraCheck = new Promise(async (resolve) => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        
        if (hasCamera) {
          diagCamera.textContent = '✓ 偵測到攝影機';
          diagCamera.className = 'diagnostic-value success';
        } else {
          diagCamera.textContent = '⚠ 未偵測到攝影機';
          diagCamera.className = 'diagnostic-value warning';
        }
        resolve(hasCamera);
      } catch (error) {
        diagCamera.textContent = '⚠ 需要 HTTPS';
        diagCamera.className = 'diagnostic-value warning';
        resolve(false);
      }
    });
    
    await Promise.race([cameraCheck, new Promise(r => setTimeout(() => {
      diagCamera.textContent = '✗ 超時';
      diagCamera.className = 'diagnostic-value warning';
      r(false);
    }, checkTimeout))]);
    
    // Recommended input method
    setTimeout(() => {
      try {
        const userAgent = navigator.userAgent;
        const isAndroid = /Android/i.test(userAgent);
        
        if (isAndroid) {
          diagRecommended.textContent = '使用「拍攝影片」或「匯入影片」';
          diagRecommended.className = 'diagnostic-value';
        } else {
          diagRecommended.textContent = '所有方式皆可用';
          diagRecommended.className = 'diagnostic-value success';
        }
      } catch (error) {
        diagRecommended.textContent = '使用「匯入影片」';
        diagRecommended.className = 'diagnostic-value';
      }
    }, 100);
    
    // Update status
    const statusDiv = document.getElementById('diagnosticsStatus');
    statusDiv.innerHTML = '✓ 診斷完成 - 應用程式已就緒';
    statusDiv.style.color = 'var(--color-success)';
    
    return { timedOut: false };
  },
  
  // Initialize MediaPipe Pose (called when user selects input)
  async initPose() {
    if (this.poseModelLoading || this.poseModelLoaded) {
      return; // Already loading or loaded
    }
    
    this.poseModelLoading = true;
    this.updateStatus('正在載入 Pose 模型...');
    
    try {
      this.pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });
      
      this.pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      this.pose.onResults(this.onPoseResults.bind(this));
      
      this.poseModelLoaded = true;
      this.poseModelLoading = false;
      this.poseLoadError = null;
      this.updateStatus('Pose 模型載入完成');
    } catch (error) {
      console.error('Failed to load Pose model:', error);
      this.poseModelLoading = false;
      this.poseLoadError = error.message;
      this.updateStatus('⚠️ Pose 模型載入失敗，但可以播放影片', true);
    }
  },
  
  // Retry loading Pose model
  async retryPoseLoad() {
    this.poseModelLoaded = false;
    this.poseModelLoading = false;
    this.poseLoadError = null;
    await this.initPose();
  },
  
  // Handle pose detection results
  onPoseResults(results) {
    this.currentPose = results;
    
    if (results.poseLandmarks) {
      // Calculate center of mass
      this.calculateCenterOfMass(results.poseLandmarks);
      
      // Update statistics
      this.updateStatistics(results.poseLandmarks);
    }
    
    this.drawResults(results);
    this.updateAngleDisplay(results);
    this.updateCoMDisplay();
  },
  
  // Calculate center of mass using weighted biomechanics
  calculateCenterOfMass(landmarks) {
    const weights = {
      0: 0.08,   // nose/head
      11: 0.05,  // left shoulder
      12: 0.05,  // right shoulder
      13: 0.05,  // left elbow
      14: 0.05,  // right elbow
      23: 0.25,  // left hip
      24: 0.25,  // right hip
      25: 0.08,  // left knee
      26: 0.08   // right knee
    };
    
    let totalX = 0, totalY = 0, totalZ = 0, totalWeight = 0;
    
    Object.entries(weights).forEach(([idx, weight]) => {
      const landmark = landmarks[parseInt(idx)];
      if (landmark && landmark.visibility > 0.5) {
        totalX += landmark.x * weight;
        totalY += landmark.y * weight;
        totalZ += (landmark.z || 0) * weight;
        totalWeight += weight;
      }
    });
    
    if (totalWeight > 0) {
      this.comPosition = {
        x: totalX / totalWeight,
        y: totalY / totalWeight,
        z: totalZ / totalWeight,
        timestamp: Date.now()
      };
      
      // Update trail (keep last 0.5 seconds)
      this.comTrail.push({ ...this.comPosition });
      const cutoffTime = Date.now() - 500; // 0.5 seconds
      this.comTrail = this.comTrail.filter(pos => pos.timestamp > cutoffTime);
    }
  },
  
  // Calculate hand openness (for grip detection)
  calculateHandOpenness(landmarks, side) {
    // Get hand landmarks for specified side
    const handIndices = side === 'left' ? 
      { thumb: 21, index: 19, pinky: 17, wrist: 15 } :
      { thumb: 22, index: 20, pinky: 18, wrist: 16 };
    
    const thumb = landmarks[handIndices.thumb];
    const index = landmarks[handIndices.index];
    const pinky = landmarks[handIndices.pinky];
    const wrist = landmarks[handIndices.wrist];
    
    if (!thumb || !index || !pinky || !wrist) return null;
    if (thumb.visibility < 0.5 || index.visibility < 0.5 || pinky.visibility < 0.5) return null;
    
    // Calculate spread distance between thumb and pinky
    const spreadDistance = Math.sqrt(
      Math.pow(thumb.x - pinky.x, 2) + 
      Math.pow(thumb.y - pinky.y, 2)
    );
    
    // Normalize by hand size (wrist to index distance)
    const handSize = Math.sqrt(
      Math.pow(wrist.x - index.x, 2) + 
      Math.pow(wrist.y - index.y, 2)
    );
    
    if (handSize === 0) return null;
    
    // Return normalized openness (0 = closed/gripping, 1 = fully open)
    return spreadDistance / handSize;
  },
  
  // Determine arm swing phase (forward or backward)
  determineSwingPhase(landmarks, side) {
    const shoulderIdx = side === 'left' ? 11 : 12;
    const elbowIdx = side === 'left' ? 13 : 14;
    const wristIdx = side === 'left' ? 15 : 16;
    const hipIdx = side === 'left' ? 23 : 24;
    
    const shoulder = landmarks[shoulderIdx];
    const elbow = landmarks[elbowIdx];
    const wrist = landmarks[wristIdx];
    const hip = landmarks[hipIdx];
    
    if (!shoulder || !elbow || !wrist || !hip) return 'unknown';
    if (wrist.visibility < 0.5 || elbow.visibility < 0.5) return 'unknown';
    
    // For side views, use X position relative to body center
    if (this.currentView === 'left' || this.currentView === 'right') {
      const bodyCenter = (shoulder.x + hip.x) / 2;
      const wristRelativeX = wrist.x - bodyCenter;
      
      // For left view: negative X = forward, positive X = backward
      // For right view: positive X = forward, negative X = backward
      if (this.currentView === 'left') {
        return wristRelativeX < -0.05 ? 'forward' : (wristRelativeX > 0.05 ? 'backward' : 'transition');
      } else {
        return wristRelativeX > 0.05 ? 'forward' : (wristRelativeX < -0.05 ? 'backward' : 'transition');
      }
    }
    
    // For front/back views, use Z position (depth) if available
    if (wrist.z !== undefined && shoulder.z !== undefined) {
      const depthDiff = wrist.z - shoulder.z;
      
      if (this.currentView === 'front') {
        return depthDiff < -0.05 ? 'forward' : (depthDiff > 0.05 ? 'backward' : 'transition');
      } else if (this.currentView === 'back') {
        return depthDiff > 0.05 ? 'forward' : (depthDiff < -0.05 ? 'backward' : 'transition');
      }
    }
    
    // Fallback: use Y position (height) - higher = forward swing
    const shoulderY = shoulder.y;
    const wristY = wrist.y;
    const heightDiff = shoulderY - wristY;
    
    return heightDiff > 0.1 ? 'forward' : (heightDiff < -0.05 ? 'backward' : 'transition');
  },
  
  // Update grip statistics for both arms
  updateGripStatistics(landmarks) {
    ['left', 'right'].forEach(side => {
      const stats = this.gripStats[side];
      
      // Calculate hand openness
      const openness = this.calculateHandOpenness(landmarks, side);
      if (openness === null) return;
      
      stats.handOpenness = openness;
      
      // Determine swing phase
      const phase = this.determineSwingPhase(landmarks, side);
      stats.currentPhase = phase;
      
      // Determine grip status (threshold: < 0.6 = gripping, >= 0.6 = open)
      const isGripping = openness < 0.6;
      stats.currentGrip = isGripping ? '握拳' : '鬆開';
      
      // Update consistency tracking
      if (phase === 'forward') {
        stats.forwardSwing.total++;
        if (isGripping) {
          stats.forwardSwing.gripping++;
        }
        stats.forwardSwing.consistency = 
          (stats.forwardSwing.gripping / stats.forwardSwing.total) * 100;
      } else if (phase === 'backward') {
        stats.backwardSwing.total++;
        if (!isGripping) {
          stats.backwardSwing.open++;
        }
        stats.backwardSwing.consistency = 
          (stats.backwardSwing.open / stats.backwardSwing.total) * 100;
      }
    });
    
    // Check coordination (when one arm forward, other should be backward)
    const leftPhase = this.gripStats.left.currentPhase;
    const rightPhase = this.gripStats.right.currentPhase;
    const leftGrip = this.gripStats.left.currentGrip;
    const rightGrip = this.gripStats.right.currentGrip;
    
    if ((leftPhase === 'forward' || leftPhase === 'backward') && 
        (rightPhase === 'forward' || rightPhase === 'backward')) {
      this.gripStats.coordination.total++;
      
      // Good coordination: opposite phases with correct grip
      const goodCoordination = 
        (leftPhase === 'forward' && rightPhase === 'backward' && leftGrip === '握拳' && rightGrip === '鬆開') ||
        (leftPhase === 'backward' && rightPhase === 'forward' && leftGrip === '鬆開' && rightGrip === '握拳');
      
      if (goodCoordination) {
        this.gripStats.coordination.synchronized++;
      }
      
      this.gripStats.coordination.percentage = 
        (this.gripStats.coordination.synchronized / this.gripStats.coordination.total) * 100;
    }
  },
  
  // Update statistics with current frame data
  updateStatistics(landmarks) {
    const angles = this.calculateAngles(landmarks);
    const config = this.viewConfigs[this.currentView];
    
    // Update angle statistics
    config.angles.forEach(angleConfig => {
      const key = angleConfig.key;
      const value = angles[key];
      
      if (value !== null && !isNaN(value)) {
        const stats = this.angleStats[key];
        stats.current = value;
        stats.max = Math.max(stats.max, value);
        stats.min = Math.min(stats.min, value);
        stats.values.push(value);
        
        // Keep only last 300 values (10 seconds at 30fps)
        if (stats.values.length > 300) {
          stats.values.shift();
        }
        
        // Calculate average
        stats.average = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
      }
    });
    
    // Update stride statistics for side views
    if (this.currentView === 'left' || this.currentView === 'right') {
      this.updateStrideStatistics(landmarks);
    }
    
    // Update grip statistics
    this.updateGripStatistics(landmarks);
  },
  
  // Update stride statistics
  updateStrideStatistics(landmarks) {
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle && leftAnkle.visibility > 0.5 && rightAnkle.visibility > 0.5) {
      // Calculate stride length (horizontal distance between feet)
      const stridePixels = Math.abs(leftAnkle.x - rightAnkle.x) * this.canvasElement.width;
      const strideCm = stridePixels / this.pixelsPerCm;
      
      this.strideStats.current = strideCm;
      
      // Only update max/min if stride is reasonable (between 20-150 cm)
      if (strideCm > 20 && strideCm < 150) {
        this.strideStats.max = Math.max(this.strideStats.max, strideCm);
        this.strideStats.min = Math.min(this.strideStats.min, strideCm);
        this.strideStats.values.push(strideCm);
        
        // Keep only last 300 values
        if (this.strideStats.values.length > 300) {
          this.strideStats.values.shift();
        }
        
        // Calculate average
        if (this.strideStats.values.length > 0) {
          this.strideStats.average = this.strideStats.values.reduce((a, b) => a + b, 0) / this.strideStats.values.length;
        }
      }
    }
  },
  
  // Update CoM display
  updateCoMDisplay() {
    const comValue = document.getElementById('comValue');
    if (this.comPosition && comValue) {
      const x = (this.comPosition.x * 100).toFixed(1);
      const y = (this.comPosition.y * 100).toFixed(1);
      comValue.textContent = `X: ${x}%, Y: ${y}% (從畫面左上角)`;
    }
  },
  
  // Draw results on canvas
  drawResults(results) {
    const ctx = this.canvasCtx;
    const canvas = this.canvasElement;
    
    // Clear canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
    
    if (results.poseLandmarks) {
      // Draw reference lines
      if (this.showGroundLine) {
        this.drawGroundLine(ctx, canvas, results.poseLandmarks);
      }
      
      if (this.showVerticalLine) {
        this.drawVerticalLine(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw skeleton
      if (this.showSkeleton) {
        this.drawSkeleton(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw walking poles (corrected positioning)
      if (this.showPoles) {
        this.drawWalkingPoles(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw center of mass
      if (this.showCoM) {
        this.drawCenterOfMass(ctx, canvas, results.poseLandmarks);
      }
      
      // Draw grip indicators
      this.drawGripIndicators(ctx, canvas, results.poseLandmarks);
      
      // Draw angle annotations
      this.drawAngleAnnotations(ctx, canvas, results.poseLandmarks);
    }
    
    ctx.restore();
  },
  
  // Draw ground reference line
  drawGroundLine(ctx, canvas, landmarks) {
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle) {
      const y = Math.max(leftAnkle.y, rightAnkle.y) * canvas.height;
      
      ctx.strokeStyle = '#FF9500';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = '#FF9500';
      ctx.font = '12px FKGroteskNeue, sans-serif';
      ctx.fillText('地平線', 10, y - 10);
    }
  },
  
  // Draw vertical reference line
  drawVerticalLine(ctx, canvas, landmarks) {
    const nose = landmarks[0];
    
    if (nose) {
      const x = nose.x * canvas.width;
      
      ctx.strokeStyle = '#FF9500';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = '#FF9500';
      ctx.font = '12px FKGroteskNeue, sans-serif';
      ctx.fillText('中軸線', x + 10, 20);
    }
  },
  
  // Draw center of mass
  drawCenterOfMass(ctx, canvas, landmarks) {
    if (!this.comPosition) return;
    
    const comX = this.comPosition.x * canvas.width;
    const comY = this.comPosition.y * canvas.height;
    
    // Draw trail (faded orange dots)
    this.comTrail.forEach((pos, idx) => {
      const alpha = (idx + 1) / this.comTrail.length * 0.5;
      ctx.fillStyle = `rgba(255, 149, 0, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pos.x * canvas.width, pos.y * canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw main CoM marker (orange circle)
    ctx.fillStyle = '#FF9500';
    ctx.beginPath();
    ctx.arc(comX, comY, 8, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw white center dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(comX, comY, 3, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw vertical line from CoM to ground
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle) {
      const groundY = Math.max(leftAnkle.y, rightAnkle.y) * canvas.height;
      
      ctx.strokeStyle = 'rgba(255, 149, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(comX, comY);
      ctx.lineTo(comX, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Label
    ctx.fillStyle = '#FF9500';
    ctx.font = 'bold 12px FKGroteskNeue, sans-serif';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText('質心', comX + 12, comY - 5);
    ctx.fillText('質心', comX + 12, comY - 5);
  },
  
  // Draw walking poles with CORRECTED positioning (backward to ground)
  drawWalkingPoles(ctx, canvas, landmarks) {
    if (!this.showPoles) return;
    
    // Define hand and body landmarks
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (!leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return;
    if (leftWrist.visibility < 0.5 || rightWrist.visibility < 0.5) return;
    
    // Calculate ground line Y position
    const groundY = Math.max(leftAnkle.y, rightAnkle.y) * canvas.height;
    
    // Draw LEFT pole (RED dashed line)
    this.drawSinglePole(ctx, canvas, leftWrist, leftShoulder, leftHip, groundY, '#FF0000', 'left');
    
    // Draw RIGHT pole (GREEN dashed line)
    this.drawSinglePole(ctx, canvas, rightWrist, rightShoulder, rightHip, groundY, '#00FF00', 'right');
  },
  
  // Draw a single pole from hand grip to ground (backward)
  drawSinglePole(ctx, canvas, wrist, shoulder, hip, groundY, color, side) {
    if (!wrist || !shoulder || !hip) return;
    if (wrist.visibility < 0.5) return;
    
    // Start point: Hand grip position (wrist)
    const startX = wrist.x * canvas.width;
    const startY = wrist.y * canvas.height;
    
    // Calculate body forward direction
    const bodyForwardX = (shoulder.x + hip.x) / 2;
    
    // End point: Ground contact BEHIND the body
    let endX;
    
    if (this.currentView === 'left') {
      // Left side view: forward is left (negative X), backward is right (positive X)
      const wristRelativeX = wrist.x - bodyForwardX;
      if (wristRelativeX < 0) {
        // Arm is forward, pole touches ground behind = more to the right
        endX = (wrist.x + 0.15) * canvas.width;
      } else {
        // Arm is backward, pole touches ground even more behind
        endX = (wrist.x + 0.25) * canvas.width;
      }
    } else if (this.currentView === 'right') {
      // Right side view: forward is right (positive X), backward is left (negative X)
      const wristRelativeX = wrist.x - bodyForwardX;
      if (wristRelativeX > 0) {
        // Arm is forward, pole touches ground behind = more to the left
        endX = (wrist.x - 0.15) * canvas.width;
      } else {
        // Arm is backward, pole touches ground even more behind
        endX = (wrist.x - 0.25) * canvas.width;
      }
    } else {
      // Front/back views: use Z-depth or slight offset
      if (side === 'left') {
        endX = (wrist.x - 0.08) * canvas.width;
      } else {
        endX = (wrist.x + 0.08) * canvas.width;
      }
    }
    
    const endY = groundY;
    
    // Draw dashed line from hand to ground (backward)
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Calculate and display pole angle
    const angle = this.calculatePoleAngle(startX, startY, endX, endY);
    
    // Update pole statistics
    this.updatePoleStats(`${side}PoleAngle`, angle);
    
    // Draw pole tip marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    // Label pole angle at tip
    ctx.font = 'bold 11px FKGroteskNeue, sans-serif';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    const label = `${side === 'left' ? 'L' : 'R'}: ${angle.toFixed(1)}°`;
    ctx.strokeText(label, endX + 10, endY - 5);
    ctx.fillText(label, endX + 10, endY - 5);
  },
  
  // Calculate pole angle from vertical (ground touch angle)
  calculatePoleAngle(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const angleRad = Math.atan2(Math.abs(dx), dy);
    return angleRad * 180 / Math.PI;
  },
  
  // Update pole statistics
  updatePoleStats(key, value) {
    if (!this.poleStats) {
      this.poleStats = {};
    }
    
    if (!this.poleStats[key]) {
      this.poleStats[key] = {
        current: 0,
        max: 0,
        min: Infinity,
        values: [],
        average: 0
      };
    }
    
    const stats = this.poleStats[key];
    stats.current = value;
    stats.max = Math.max(stats.max, value);
    stats.min = Math.min(stats.min, value);
    stats.values.push(value);
    
    // Keep only last 300 values
    if (stats.values.length > 300) {
      stats.values.shift();
    }
    
    // Calculate average
    stats.average = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
  },
  
  // Pole stride position removed - function kept as stub for compatibility
  updatePoleStridePosition(landmarks, poleEndX, side) {
    // Pole stride position tracking removed as requested
  },
  
  // Draw skeleton based on current view with color-coded sides
  drawSkeleton(ctx, canvas, landmarks) {
    const config = this.viewConfigs[this.currentView];
    const connections = config.connections;
    
    // Define landmark side mapping
    const leftSideLandmarks = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    const rightSideLandmarks = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
    
    // Helper function to get bone color
    const getBoneColor = (startIdx, endIdx) => {
      const startIsLeft = leftSideLandmarks.includes(startIdx);
      const startIsRight = rightSideLandmarks.includes(startIdx);
      const endIsLeft = leftSideLandmarks.includes(endIdx);
      const endIsRight = rightSideLandmarks.includes(endIdx);
      
      // If both points are on left side -> RED
      if (startIsLeft && endIsLeft) {
        return '#FF0000';
      }
      // If both points are on right side -> GREEN
      if (startIsRight && endIsRight) {
        return '#00FF00';
      }
      // Mixed or center -> YELLOW
      return '#FFD700';
    };
    
    // Helper function to get joint color
    const getJointColor = (idx) => {
      if (leftSideLandmarks.includes(idx)) {
        return '#FF0000';
      }
      if (rightSideLandmarks.includes(idx)) {
        return '#00FF00';
      }
      return '#FFD700';
    };
    
    // Draw connections with color-coded sides
    ctx.lineWidth = 3;
    
    connections.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      
      if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
        ctx.strokeStyle = getBoneColor(startIdx, endIdx);
        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.stroke();
      }
    });
    
    // Draw joints with color-coded sides
    const drawnJoints = new Set();
    connections.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      
      if (start && start.visibility > 0.5 && !drawnJoints.has(startIdx)) {
        ctx.fillStyle = getJointColor(startIdx);
        ctx.beginPath();
        ctx.arc(start.x * canvas.width, start.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fill();
        drawnJoints.add(startIdx);
      }
      
      if (end && end.visibility > 0.5 && !drawnJoints.has(endIdx)) {
        ctx.fillStyle = getJointColor(endIdx);
        ctx.beginPath();
        ctx.arc(end.x * canvas.width, end.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fill();
        drawnJoints.add(endIdx);
      }
    });
  },
  
  // Draw grip indicators on hands
  drawGripIndicators(ctx, canvas, landmarks) {
    ['left', 'right'].forEach(side => {
      const stats = this.gripStats[side];
      const wristIdx = side === 'left' ? 15 : 16;
      const wrist = landmarks[wristIdx];
      
      if (!wrist || wrist.visibility < 0.5) return;
      
      const x = wrist.x * canvas.width;
      const y = wrist.y * canvas.height;
      const phase = stats.currentPhase;
      const grip = stats.currentGrip;
      
      // Determine indicator color and emoji
      let color, emoji, isCorrect;
      
      if (phase === 'forward') {
        // Forward swing should be gripping
        isCorrect = grip === '握拳';
        color = isCorrect ? '#FF0000' : '#FFFF00';
        emoji = isCorrect ? '🔴' : '⚠️';
      } else if (phase === 'backward') {
        // Backward swing should be open
        isCorrect = grip === '鬆開';
        color = isCorrect ? '#00FF00' : '#FFFF00';
        emoji = isCorrect ? '🟢' : '⚠️';
      } else {
        // Transition phase
        color = '#FFFF00';
        emoji = '🟡';
        isCorrect = true;
      }
      
      // Draw circle indicator
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      
      // Draw emoji
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, x, y);
      
      // Draw label
      ctx.font = 'bold 12px FKGroteskNeue, sans-serif';
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      const label = `${side === 'left' ? '左' : '右'}: ${grip}`;
      ctx.strokeText(label, x, y + 25);
      ctx.fillText(label, x, y + 25);
      
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  },
  
  // Draw angle annotations on canvas
  drawAngleAnnotations(ctx, canvas, landmarks) {
    const angles = this.calculateAngles(landmarks);
    const config = this.viewConfigs[this.currentView];
    
    ctx.font = 'bold 14px FKGroteskNeue, sans-serif';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    
    let yOffset = 30;
    config.angles.forEach(angleConfig => {
      const value = angles[angleConfig.key];
      if (value !== null) {
        const status = this.getAngleStatus(value, angleConfig.range);
        const color = status === 'good' ? '#00FF00' : (status === 'warning' ? '#FFFF00' : '#FF0000');
        
        const text = `${angleConfig.label}: ${value.toFixed(1)}°`;
        ctx.strokeText(text, 10, yOffset);
        ctx.fillStyle = color;
        ctx.fillText(text, 10, yOffset);
        yOffset += 25;
      }
    });
  },
  
  // Calculate angles based on current view
  calculateAngles(landmarks) {
    const angles = {
      armSwing: null,
      shoulderRotation: null,
      trunkLean: null,
      hipExtension: null,
      frontSwingAngle: null,
      backSwingAngle: null,
      lateralTrunkLean: null
    };
    
    if (this.currentView === 'front' || this.currentView === 'back') {
      // Arm swing (frontal plane)
      const leftShoulder = landmarks[11];
      const leftElbow = landmarks[13];
      const leftWrist = landmarks[15];
      
      if (leftShoulder && leftElbow && leftWrist) {
        angles.armSwing = this.calculateAngle3D(leftShoulder, leftElbow, leftWrist);
      }
      
      // Shoulder rotation
      const rightShoulder = landmarks[12];
      if (leftShoulder && rightShoulder) {
        const shoulderLine = Math.atan2(
          rightShoulder.y - leftShoulder.y,
          rightShoulder.x - leftShoulder.x
        );
        angles.shoulderRotation = Math.abs(shoulderLine * 180 / Math.PI);
      }
      
      // Trunk lean
      const leftHip = landmarks[23];
      if (leftShoulder && leftHip) {
        const trunkAngle = Math.atan2(
          leftHip.x - leftShoulder.x,
          leftHip.y - leftShoulder.y
        );
        angles.trunkLean = Math.abs(trunkAngle * 180 / Math.PI - 180);
      }
      
      // Hip extension (for back view)
      if (this.currentView === 'back') {
        const leftKnee = landmarks[25];
        if (leftHip && leftKnee && leftShoulder) {
          angles.hipExtension = this.calculateAngle3D(leftShoulder, leftHip, leftKnee);
        }
      }
    } else if (this.currentView === 'left' || this.currentView === 'right') {
      // For lateral views: calculate front and back swing angles
      const shoulder = this.currentView === 'left' ? landmarks[11] : landmarks[12];
      const wrist = this.currentView === 'left' ? landmarks[15] : landmarks[16];
      const hip = this.currentView === 'left' ? landmarks[23] : landmarks[24];
      
      if (shoulder && wrist && hip) {
        // Calculate vertical center axis through shoulder and hip
        const verticalX = shoulder.x;
        
        // Determine if arm is in front or behind body center
        const armRelativeX = wrist.x - verticalX;
        
        // Calculate arm angle from vertical
        const armVector = {
          x: wrist.x - shoulder.x,
          y: wrist.y - shoulder.y
        };
        
        const angleFromVertical = Math.atan2(Math.abs(armVector.x), armVector.y) * 180 / Math.PI;
        
        // Assign to front or back swing based on position
        if ((this.currentView === 'left' && armRelativeX < 0) || (this.currentView === 'right' && armRelativeX > 0)) {
          // Arm is in front
          angles.frontSwingAngle = angleFromVertical;
        } else {
          // Arm is behind
          angles.backSwingAngle = angleFromVertical;
        }
      }
      
      // Lateral trunk lean (forward lean angle)
      if (shoulder && hip) {
        const trunkVector = {
          x: hip.x - shoulder.x,
          y: hip.y - shoulder.y
        };
        
        // Angle from vertical (positive = leaning forward)
        angles.lateralTrunkLean = Math.atan2(Math.abs(trunkVector.x), trunkVector.y) * 180 / Math.PI;
      }
    }
    
    return angles;
  },
  
  // Calculate 3D angle between three points
  calculateAngle3D(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180 / Math.PI);
    
    if (angle > 180) {
      angle = 360 - angle;
    }
    
    return angle;
  },
  
  // Get angle status based on range
  getAngleStatus(value, range) {
    if (!range || range.length !== 2) return 'good';
    const [min, max] = range;
    const tolerance = (max - min) * 0.2;
    
    if (value >= min && value <= max) return 'good';
    if (value >= min - tolerance && value <= max + tolerance) return 'warning';
    return 'error';
  },
  
  // Update angle display panel with statistics
  updateAngleDisplay(results) {
    if (!results.poseLandmarks) return;
    
    const angles = this.calculateAngles(results.poseLandmarks);
    const config = this.viewConfigs[this.currentView];
    
    // Update angle display HTML
    const angleDisplay = document.getElementById('angleDisplay');
    angleDisplay.innerHTML = '';
    
    config.angles.forEach(angleConfig => {
      const key = angleConfig.key;
      const stats = this.angleStats[key];
      
      const angleItem = document.createElement('div');
      angleItem.style.cssText = 'margin-bottom: 4px;';
      
      // Main row with current angle
      const mainRow = document.createElement('div');
      mainRow.className = 'angle-item';
      
      const angleName = document.createElement('span');
      angleName.className = 'angle-name';
      angleName.textContent = angleConfig.label;
      
      const angleValueSpan = document.createElement('span');
      angleValueSpan.className = 'angle-value current';
      
      if (stats.current !== null && !isNaN(stats.current)) {
        const status = this.getAngleStatus(stats.current, angleConfig.range);
        angleValueSpan.classList.add(status);
        angleValueSpan.textContent = `${stats.current.toFixed(1)}°`;
      } else {
        angleValueSpan.textContent = '--°';
      }
      
      mainRow.appendChild(angleName);
      mainRow.appendChild(angleValueSpan);
      angleItem.appendChild(mainRow);
      
      // Statistics row (compact)
      if (stats.values.length > 0) {
        const statsRow = document.createElement('div');
        statsRow.className = 'stats-row';
        
        const statTypes = [
          { label: '大', value: stats.max },
          { label: '小', value: stats.min },
          { label: '平', value: stats.average }
        ];
        
        statTypes.forEach(stat => {
          const statBox = document.createElement('div');
          statBox.className = 'stat-box';
          
          const statLabel = document.createElement('span');
          statLabel.className = 'stat-label';
          statLabel.textContent = stat.label;
          
          const statValue = document.createElement('span');
          statValue.className = 'stat-value';
          statValue.textContent = stat.value === Infinity ? '--' : `${stat.value.toFixed(1)}°`;
          
          statBox.appendChild(statLabel);
          statBox.appendChild(statValue);
          statsRow.appendChild(statBox);
        });
        
        angleItem.appendChild(statsRow);
      }
      
      angleDisplay.appendChild(angleItem);
    });
    
    // Update pole statistics display
    this.updatePoleStatsDisplay();
    
    // Add stride statistics for side views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.strideStats.values.length > 0) {
      const strideItem = document.createElement('div');
      strideItem.style.cssText = 'margin-top: 4px;';
      
      const mainRow = document.createElement('div');
      mainRow.className = 'angle-item';
      
      const strideName = document.createElement('span');
      strideName.className = 'angle-name';
      strideName.textContent = '步幅';
      
      const strideValue = document.createElement('span');
      strideValue.className = 'angle-value current';
      strideValue.textContent = `${this.strideStats.current.toFixed(1)} cm`;
      
      mainRow.appendChild(strideName);
      mainRow.appendChild(strideValue);
      strideItem.appendChild(mainRow);
      
      // Stride statistics row
      const statsRow = document.createElement('div');
      statsRow.className = 'stats-row';
      
      const statTypes = [
        { label: '大', value: this.strideStats.max },
        { label: '小', value: this.strideStats.min },
        { label: '平', value: this.strideStats.average }
      ];
      
      statTypes.forEach(stat => {
        const statBox = document.createElement('div');
        statBox.className = 'stat-box';
        
        const statLabel = document.createElement('span');
        statLabel.className = 'stat-label';
        statLabel.textContent = stat.label;
        
        const statValue = document.createElement('span');
        statValue.className = 'stat-value';
        statValue.textContent = stat.value === 0 || stat.value === Infinity ? '--' : `${stat.value.toFixed(1)} cm`;
        
        statBox.appendChild(statLabel);
        statBox.appendChild(statValue);
        statsRow.appendChild(statBox);
      });
      
      strideItem.appendChild(statsRow);
      angleDisplay.appendChild(strideItem);
    }
    
    // Add grip detection statistics (compact)
    if (this.gripStats.left.forwardSwing.total > 0 || this.gripStats.right.forwardSwing.total > 0) {
      const gripSection = document.createElement('div');
      gripSection.style.cssText = 'margin-top: 8px; padding: 6px; background: var(--color-bg-5); border-radius: var(--radius-sm); border: 1px solid var(--color-primary);';
      
      const sectionTitle = document.createElement('div');
      sectionTitle.style.cssText = 'font-size: 11px; font-weight: var(--font-weight-bold); color: var(--color-primary); margin-bottom: 4px; text-align: center;';
      sectionTitle.textContent = '握拳狀態';
      gripSection.appendChild(sectionTitle);
      
      // Left arm status (compact)
      const leftStats = this.gripStats.left;
      if (leftStats.currentPhase !== 'unknown') {
        const leftRow = document.createElement('div');
        leftRow.style.cssText = 'margin: 4px 0; padding: 4px; background: var(--color-surface); border-radius: var(--radius-sm);';
        
        const phaseLabel = leftStats.currentPhase === 'forward' ? '前擺' : (leftStats.currentPhase === 'backward' ? '後擺' : '過渡');
        const phaseColor = leftStats.currentPhase === 'forward' ? '#FF0000' : (leftStats.currentPhase === 'backward' ? '#00FF00' : '#FFFF00');
        
        leftRow.innerHTML = `
          <div style="font-size: 10px; font-weight: var(--font-weight-semibold); color: var(--color-text); margin-bottom: 2px;">
            ${phaseLabel}臂(左): ${leftStats.currentGrip === '握拳' ? '🔴' : '🟢'} ${leftStats.currentGrip}
          </div>
        `;
        gripSection.appendChild(leftRow);
      }
      
      // Right arm status (compact)
      const rightStats = this.gripStats.right;
      if (rightStats.currentPhase !== 'unknown') {
        const rightRow = document.createElement('div');
        rightRow.style.cssText = 'margin: 4px 0; padding: 4px; background: var(--color-surface); border-radius: var(--radius-sm);';
        
        const phaseLabel = rightStats.currentPhase === 'forward' ? '前擺' : (rightStats.currentPhase === 'backward' ? '後擺' : '過渡');
        const phaseColor = rightStats.currentPhase === 'forward' ? '#FF0000' : (rightStats.currentPhase === 'backward' ? '#00FF00' : '#FFFF00');
        
        rightRow.innerHTML = `
          <div style="font-size: 10px; font-weight: var(--font-weight-semibold); color: var(--color-text); margin-bottom: 2px;">
            ${phaseLabel}臂(右): ${rightStats.currentGrip === '握拳' ? '🔴' : '🟢'} ${rightStats.currentGrip}
          </div>
        `;
        gripSection.appendChild(rightRow);
      }
      
      // Consistency statistics (compact)
      const consistencyRow = document.createElement('div');
      consistencyRow.style.cssText = 'margin-top: 4px; padding: 4px; background: var(--color-bg-1); border-radius: var(--radius-sm);';
      
      const leftForwardConsist = leftStats.forwardSwing.consistency || 0;
      const leftBackwardConsist = leftStats.backwardSwing.consistency || 0;
      const rightForwardConsist = rightStats.forwardSwing.consistency || 0;
      const rightBackwardConsist = rightStats.backwardSwing.consistency || 0;
      
      consistencyRow.innerHTML = `
        <div style="font-size: 9px; color: var(--color-text-secondary); margin-bottom: 2px; font-weight: var(--font-weight-semibold);">一致性:</div>
        <div style="font-size: 9px; color: var(--color-text); line-height: 1.4;">
          <div>L前握: ${leftForwardConsist.toFixed(0)}% | L後開: ${leftBackwardConsist.toFixed(0)}%</div>
          <div>R前握: ${rightForwardConsist.toFixed(0)}% | R後開: ${rightBackwardConsist.toFixed(0)}%</div>
        </div>
      `;
      gripSection.appendChild(consistencyRow);
      
      // Coordination feedback (compact)
      if (this.gripStats.coordination.total > 10) {
        const coordRow = document.createElement('div');
        coordRow.style.cssText = 'margin-top: 4px; padding: 4px; background: var(--color-bg-3); border-radius: var(--radius-sm);';
        
        const coordPercent = this.gripStats.coordination.percentage;
        const coordStatus = coordPercent >= 70 ? '良好協調' : '需改進協調';
        const coordColor = coordPercent >= 70 ? 'var(--color-success)' : 'var(--color-warning)';
        
        coordRow.innerHTML = `
          <div style="font-size: 10px; color: ${coordColor}; font-weight: var(--font-weight-bold);">
            協調: ${coordStatus} (${coordPercent.toFixed(0)}%)
          </div>
        `;
        gripSection.appendChild(coordRow);
      }
      
      // Coaching feedback (compact)
      const feedbackRow = document.createElement('div');
      feedbackRow.style.cssText = 'margin-top: 4px; padding: 4px; background: var(--color-bg-2); border-radius: var(--radius-sm); border-left: 2px solid var(--color-warning);';
      
      let feedbackMessages = [];
      
      if (leftForwardConsist < 60 || rightForwardConsist < 60) {
        feedbackMessages.push('💡 前擺臂應握拳以協助推進');
      }
      if (leftBackwardConsist < 60 || rightBackwardConsist < 60) {
        feedbackMessages.push('💡 後擺臂應鬆開準備前擺');
      }
      if (this.gripStats.coordination.percentage >= 70) {
        feedbackMessages.push('✅ 左右臂協調性良好');
      } else if (this.gripStats.coordination.total > 10) {
        feedbackMessages.push('⚠️ 需改進手臂協調性');
      }
      
      if (feedbackMessages.length === 0) {
        feedbackMessages.push('👍 持續保持良好姿勢');
      }
      
      feedbackRow.innerHTML = `
        <div style="font-size: 9px; color: var(--color-text-secondary); margin-bottom: 2px; font-weight: var(--font-weight-semibold);">提示:</div>
        <div style="font-size: 9px; color: var(--color-text); line-height: 1.4;">
          ${feedbackMessages.map(msg => `<div>${msg}</div>`).join('')}
        </div>
      `;
      gripSection.appendChild(feedbackRow);
      
      angleDisplay.appendChild(gripSection);
    }
  },
  
  // Update pole statistics display panel
  updatePoleStatsDisplay() {
    const poleDisplay = document.getElementById('poleStatsDisplay');
    if (!poleDisplay) return;
    
    if (!this.poleStats || (!this.poleStats.leftPoleAngle && !this.poleStats.rightPoleAngle)) {
      poleDisplay.innerHTML = '<div style="font-size: 11px; color: var(--color-text-secondary); text-align: center; padding: 20px;">等待分析...</div>';
      return;
    }
    
    poleDisplay.innerHTML = '';
    
    // Left pole statistics
    if (this.poleStats.leftPoleAngle && this.poleStats.leftPoleAngle.values.length > 0) {
      const leftStats = this.poleStats.leftPoleAngle;
      const leftSection = document.createElement('div');
      leftSection.style.cssText = 'margin-bottom: 8px;';
      
      const leftTitle = document.createElement('div');
      leftTitle.className = 'angle-item';
      leftTitle.innerHTML = `
        <span class="angle-name" style="color: #FF0000;">• 左杖角度</span>
        <span class="angle-value current" style="color: #FF0000;">${leftStats.current.toFixed(1)}°</span>
      `;
      leftSection.appendChild(leftTitle);
      
      const leftStatsRow = document.createElement('div');
      leftStatsRow.className = 'stats-row';
      leftStatsRow.innerHTML = `
        <div class="stat-box">
          <span class="stat-label">大</span>
          <span class="stat-value">${leftStats.max.toFixed(1)}°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">小</span>
          <span class="stat-value">${leftStats.min.toFixed(1)}°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">平</span>
          <span class="stat-value">${leftStats.average.toFixed(1)}°</span>
        </div>
      `;
      leftSection.appendChild(leftStatsRow);
      poleDisplay.appendChild(leftSection);
    }
    
    // Right pole statistics
    if (this.poleStats.rightPoleAngle && this.poleStats.rightPoleAngle.values.length > 0) {
      const rightStats = this.poleStats.rightPoleAngle;
      const rightSection = document.createElement('div');
      rightSection.style.cssText = 'margin-bottom: 8px;';
      
      const rightTitle = document.createElement('div');
      rightTitle.className = 'angle-item';
      rightTitle.innerHTML = `
        <span class="angle-name" style="color: #00FF00;">• 右杖角度</span>
        <span class="angle-value current" style="color: #00FF00;">${rightStats.current.toFixed(1)}°</span>
      `;
      rightSection.appendChild(rightTitle);
      
      const rightStatsRow = document.createElement('div');
      rightStatsRow.className = 'stats-row';
      rightStatsRow.innerHTML = `
        <div class="stat-box">
          <span class="stat-label">大</span>
          <span class="stat-value">${rightStats.max.toFixed(1)}°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">小</span>
          <span class="stat-value">${rightStats.min.toFixed(1)}°</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">平</span>
          <span class="stat-value">${rightStats.average.toFixed(1)}°</span>
        </div>
      `;
      rightSection.appendChild(rightStatsRow);
      poleDisplay.appendChild(rightSection);
    }
    
    // Coaching tip for poles
    const tipSection = document.createElement('div');
    tipSection.style.cssText = 'margin-top: 12px; padding: 8px; background: var(--color-bg-2); border-radius: var(--radius-sm); border-left: 2px solid var(--color-warning);';
    tipSection.innerHTML = `
      <div style="font-size: 10px; font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); margin-bottom: 4px;">💡 杖尖提示</div>
      <div style="font-size: 9px; color: var(--color-text); line-height: 1.4;">
        • 理想角度: 45-60°<br>
        • 杖尖應落在身體後方<br>
        • 红線=左杖, 绿線=右杖
      </div>
    `;
    poleDisplay.appendChild(tipSection);
  },
  
  // Set viewing angle
  setView(view) {
    this.currentView = view;
    
    // Update UI
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Update header indicator
    const indicator = document.getElementById('currentViewIndicator');
    if (indicator) {
      indicator.textContent = `${this.viewConfigs[view].label}視角`;
    }
    
    // Pause when switching views
    if (this.isVideoMode && this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.updateStatus(`視角: ${this.viewConfigs[view].label}`);
  },
  
  // Toggle ground line
  toggleGroundLine() {
    const toggle1 = document.getElementById('groundLineToggle');
    const toggle2 = document.getElementById('groundLineToggle2');
    if (toggle1) this.showGroundLine = toggle1.checked;
    if (toggle2) this.showGroundLine = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showGroundLine;
      toggle2.checked = this.showGroundLine;
    }
  },
  
  // Toggle vertical line
  toggleVerticalLine() {
    const toggle1 = document.getElementById('verticalLineToggle');
    const toggle2 = document.getElementById('verticalLineToggle2');
    if (toggle1) this.showVerticalLine = toggle1.checked;
    if (toggle2) this.showVerticalLine = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showVerticalLine;
      toggle2.checked = this.showVerticalLine;
    }
  },
  
  // Toggle skeleton
  toggleSkeleton() {
    const toggle1 = document.getElementById('skeletonToggle');
    const toggle2 = document.getElementById('skeletonToggle2');
    if (toggle1) this.showSkeleton = toggle1.checked;
    if (toggle2) this.showSkeleton = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showSkeleton;
      toggle2.checked = this.showSkeleton;
    }
  },
  
  // Toggle center of mass
  toggleCoM() {
    const toggle1 = document.getElementById('comToggle');
    const toggle2 = document.getElementById('comToggle2');
    if (toggle1) this.showCoM = toggle1.checked;
    if (toggle2) this.showCoM = toggle2.checked;
    // Sync toggles
    if (toggle1 && toggle2) {
      toggle1.checked = this.showCoM;
      toggle2.checked = this.showCoM;
    }
  },
  
  // Toggle poles
  togglePoles() {
    const toggle = document.getElementById('poleToggle2');
    if (toggle) this.showPoles = toggle.checked;
  },
  
  // Handle import video (file selection)
  handleImportVideo() {
    document.getElementById('videoFileInput').click();
  },
  
  // Handle capture video (camera capture)
  handleCaptureVideo() {
    const captureInput = document.getElementById('videoCaptureInput');
    const fallbackInput = document.getElementById('videoFallbackInput');
    
    // Try capture input first, fallback if not supported
    try {
      captureInput.click();
    } catch (error) {
      console.warn('Capture input not supported, using fallback');
      fallbackInput.click();
    }
  },
  
  // Handle file selected
  async handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    this.updateStatus('載入影片中...');
    
    // Initialize Pose model in background if not already loaded
    if (!this.poseModelLoaded && !this.poseModelLoading) {
      this.initPose(); // Non-blocking
    }
    
    // Reset statistics
    this.resetStatistics();
    
    // Stop camera if active
    if (this.isCameraActive) {
      this.stopCamera();
    }
    
    // Create video element
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
    }
    
    this.videoElement = document.createElement('video');
    this.videoElement.src = URL.createObjectURL(file);
    this.videoElement.loop = true;
    this.videoElement.muted = true;

    // On video metadata loaded: setup canvas and ratio box
    this.videoElement.onloadedmetadata = () => {
      // Set canvas size (no stretching)
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;

      // Adjust the container aspect ratio to match video
      if (this.ratioBox) {
        this.updateCanvasContainerAspectRatio(this.videoElement.videoWidth, this.videoElement.videoHeight);
      }

      // Don't auto-play
      this.isVideoMode = true;
      this.isPlaying = false;
      this.videoElement.loop = false;

      document.getElementById('uploadOverlay').classList.add('hidden');
      document.getElementById('playbackControls').style.display = 'flex';
      this.updatePlayPauseButton();
      this.updateStatus('影片已載入，按播放開始分析');

      // Update time display
      this.updateTimeDisplay();
    };

    // Handle video end event for single-play mode
    this.videoElement.onended = () => {
      this.isPlaying = false;
      this.stopAnalysis();
      this.updatePlayPauseButton();
      this.updateStatus('播放完成');
    };

    // Update time display during playback
    this.videoElement.ontimeupdate = () => {
      this.updateTimeDisplay();
    };
  },
  
  // Toggle camera
  async toggleCamera() {
    if (this.isCameraActive) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  },
  
  // Reset statistics
  resetStatistics() {
    // Reset angle statistics
    Object.keys(this.angleStats).forEach(key => {
      this.angleStats[key] = {
        current: 0,
        max: 0,
        min: Infinity,
        values: [],
        average: 0
      };
    });
    
    // Pole statistics removed
    
    // Reset stride statistics
    this.strideStats = {
      current: 0,
      max: 0,
      min: Infinity,
      values: [],
      average: 0
    };
    
    // Reset grip statistics
    this.gripStats = {
      left: {
        forwardSwing: { gripping: 0, total: 0, consistency: 0 },
        backwardSwing: { open: 0, total: 0, consistency: 0 },
        currentPhase: 'unknown',
        currentGrip: 'unknown',
        handOpenness: 0
      },
      right: {
        forwardSwing: { gripping: 0, total: 0, consistency: 0 },
        backwardSwing: { open: 0, total: 0, consistency: 0 },
        currentPhase: 'unknown',
        currentGrip: 'unknown',
        handOpenness: 0
      },
      coordination: { synchronized: 0, total: 0, percentage: 0 }
    };
    
    // Reset CoM
    this.comPosition = null;
    this.comTrail = [];
    
    // Reset frame tracking
    this.currentFrame = 0;
    this.lastProcessedFrame = -1;
    
    // Update pole display
    const poleDisplay = document.getElementById('poleStatsDisplay');
    if (poleDisplay) {
      poleDisplay.innerHTML = '<div style="font-size: 11px; color: var(--color-text-secondary); text-align: center; padding: 20px;">等待分析...</div>';
    }
  },
  
  // Start camera
  async startCamera() {
    try {
      this.updateStatus('啟動攝影機...');
      
      // Initialize Pose model in background if not already loaded
      if (!this.poseModelLoaded && !this.poseModelLoading) {
        this.initPose(); // Non-blocking
      }
      
      // Reset statistics
      this.resetStatistics();
      
      // Stop video if playing
      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.src = '';
      }
      
      // Create video element for camera
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', '');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }
      });
      
      this.videoElement.srcObject = stream;
      this.videoElement.onloadedmetadata = () => {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;

        // Adjust the container aspect ratio to match camera
        if (this.ratioBox) {
          this.updateCanvasContainerAspectRatio(this.videoElement.videoWidth, this.videoElement.videoHeight);
        }

        this.videoElement.play();
        this.startAnalysis();

        this.isVideoMode = false;
        document.getElementById('playbackControls').style.display = 'none';

        document.getElementById('uploadOverlay').classList.add('hidden');
        this.updateStatus('攝影機已啟動');

        this.isCameraActive = true;
        document.getElementById('cameraBtn').textContent = '⏹ 停止攝影機';
      };
    } catch (error) {
      console.error('Failed to start camera:', error);
      this.updateStatus('無法啟動攝影機', true);
    }
  },
  
  // Stop camera
  stopCamera() {
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = this.videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    
    this.stopAnalysis();
    this.isCameraActive = false;
    document.getElementById('cameraBtn').textContent = '📷 啟動攝影機';
    document.getElementById('uploadOverlay').classList.remove('hidden');
    this.updateStatus('攝影機已停止');
  },
  
  // Start analysis
  startAnalysis() {
    this.isAnalyzing = true;
    this.analyzeFrame();
  },
  
  // Stop analysis
  stopAnalysis() {
    this.isAnalyzing = false;
  },
  
  // Analyze frame
  async analyzeFrame() {
    if (!this.isAnalyzing || !this.videoElement) return;
    
    // Calculate current frame number for sync
    if (this.isVideoMode && this.videoElement.duration) {
      this.currentFrame = Math.floor(this.videoElement.currentTime * 30); // Assuming 30fps
    }
    
    // Only process if Pose model is loaded and frame changed
    if (this.poseModelLoaded && this.pose && this.currentFrame !== this.lastProcessedFrame) {
      try {
        await this.pose.send({ image: this.videoElement });
        this.lastProcessedFrame = this.currentFrame;
      } catch (error) {
        console.error('Pose processing error:', error);
        // Continue playback even if pose fails
      }
    } else if (!this.poseModelLoaded) {
      // Just draw video without skeleton
      const ctx = this.canvasCtx;
      const canvas = this.canvasElement;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
    }
    
    requestAnimationFrame(() => this.analyzeFrame());
  },
  
  // Export current frame
  exportFrame() {
    const link = document.createElement('a');
    link.download = `nordic-walking-${this.currentView}-${Date.now()}.png`;
    link.href = this.canvasElement.toDataURL();
    link.click();
    
    this.updateStatus('畫面已匯出');
  },
  
  // Export video (placeholder)
  exportVideo() {
    alert('影片匯出功能開發中...');
  },
  
  // Toggle play/pause
  togglePlayPause() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    if (this.isPlaying) {
      this.videoElement.pause();
      this.stopAnalysis();
      this.isPlaying = false;
      this.updateStatus('已暫停');
    } else {
      this.videoElement.play();
      this.startAnalysis();
      this.isPlaying = true;
      this.updateStatus('分析中...');
    }
    
    this.updatePlayPauseButton();
  },
  
  // Update play/pause button
  updatePlayPauseButton() {
    const btn = document.getElementById('playPauseBtn');
    if (btn) {
      btn.textContent = this.isPlaying ? '⏸ 暫停' : '▶️ 播放';
    }
  },
  
  // Set playback speed
  setSpeed(speed) {
    this.currentSpeed = speed;
    if (this.videoElement) {
      this.videoElement.playbackRate = speed;
    }
    
    // Update UI
    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-speed="${speed}"]`).classList.add('active');
    
    this.updateStatus(`播放速度: ${speed}x`);
  },
  
  // Previous frame
  async previousFrame() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    if (this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.videoElement.currentTime = Math.max(0, this.videoElement.currentTime - 1/30);
    this.updateTimeDisplay();
    
    // Force immediate frame processing
    await this.pose.send({ image: this.videoElement });
  },
  
  // Next frame
  async nextFrame() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    if (this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.videoElement.currentTime = Math.min(this.videoElement.duration, this.videoElement.currentTime + 1/30);
    this.updateTimeDisplay();
    
    // Force immediate frame processing
    await this.pose.send({ image: this.videoElement });
  },
  
  // Update time display
  updateTimeDisplay() {
    if (!this.videoElement || !this.isVideoMode) return;
    
    const current = this.videoElement.currentTime;
    const total = this.videoElement.duration || 0;
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    let displayText = `${formatTime(current)} / ${formatTime(total)}`;
    
    // Show frame number when paused
    if (!this.isPlaying && total > 0) {
      const frameNumber = Math.floor(current * 30); // Assuming 30fps
      displayText += ` (幀 ${frameNumber})`;
    }
    
    // Update both time displays
    const timeDisplay = document.getElementById('timeDisplay');
    const timeDisplayTop = document.getElementById('timeDisplayTop');
    if (timeDisplay) timeDisplay.textContent = displayText;
    if (timeDisplayTop) timeDisplayTop.textContent = displayText;
  },
  
  // Export statistics as text file
  exportStatistics() {
    if (!this.currentPose || !this.currentPose.poseLandmarks) {
      alert('請先進行動作分析');
      return;
    }
    
    const config = this.viewConfigs[this.currentView];
    
    let report = `Nordic Walking 統計數據\n`;
    report += `================================\n\n`;
    report += `視角: ${config.label}\n`;
    report += `匯出時間: ${new Date().toLocaleString('zh-TW')}\n\n`;
    
    report += `角度統計 (度):\n`;
    report += `--------------------------------\n`;
    
    config.angles.forEach(angleConfig => {
      const stats = this.angleStats[angleConfig.key];
      if (stats.values.length > 0) {
        report += `${angleConfig.label}:\n`;
        report += `  即時: ${stats.current.toFixed(1)}°\n`;
        report += `  最大: ${stats.max.toFixed(1)}°\n`;
        report += `  最小: ${stats.min.toFixed(1)}°\n`;
        report += `  平均: ${stats.average.toFixed(1)}°\n`;
        report += `  建議範圍: ${angleConfig.range[0]}-${angleConfig.range[1]}°\n\n`;
      }
    });
    
    // Add pole statistics for side views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.poleStats) {
      const leftPole = this.poleStats.leftPoleAngle;
      const rightPole = this.poleStats.rightPoleAngle;
      
      if (leftPole && leftPole.values.length > 0) {
        report += `杖尖角度統計 (度):\n`;
        report += `--------------------------------\n`;
        report += `左杖:\n`;
        report += `  即時: ${leftPole.current.toFixed(1)}°\n`;
        report += `  最大: ${leftPole.max.toFixed(1)}°\n`;
        report += `  最小: ${leftPole.min.toFixed(1)}°\n`;
        report += `  平均: ${leftPole.average.toFixed(1)}°\n\n`;
      }
      
      if (rightPole && rightPole.values.length > 0) {
        report += `右杖:\n`;
        report += `  即時: ${rightPole.current.toFixed(1)}°\n`;
        report += `  最大: ${rightPole.max.toFixed(1)}°\n`;
        report += `  最小: ${rightPole.min.toFixed(1)}°\n`;
        report += `  平均: ${rightPole.average.toFixed(1)}°\n\n`;
      }
    }
    
    // Add stride statistics for side views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.strideStats.values.length > 0) {
      report += `步幅統計 (公分):\n`;
      report += `--------------------------------\n`;
      report += `  即時: ${this.strideStats.current.toFixed(1)} cm\n`;
      report += `  最大: ${this.strideStats.max.toFixed(1)} cm\n`;
      report += `  最小: ${this.strideStats.min.toFixed(1)} cm\n`;
      report += `  平均: ${this.strideStats.average.toFixed(1)} cm\n\n`;
    }
    
    // Add grip detection statistics
    if (this.gripStats.left.forwardSwing.total > 0 || this.gripStats.right.forwardSwing.total > 0) {
      report += `臂部握拳狀態統計:\n`;
      report += `--------------------------------\n`;
      
      const leftStats = this.gripStats.left;
      const rightStats = this.gripStats.right;
      
      report += `左臂:\n`;
      if (leftStats.forwardSwing.total > 0) {
        report += `  前擺握拳一致性: ${leftStats.forwardSwing.consistency.toFixed(1)}%\n`;
      }
      if (leftStats.backwardSwing.total > 0) {
        report += `  後擺鬆開一致性: ${leftStats.backwardSwing.consistency.toFixed(1)}%\n`;
      }
      
      report += `右臂:\n`;
      if (rightStats.forwardSwing.total > 0) {
        report += `  前擺握拳一致性: ${rightStats.forwardSwing.consistency.toFixed(1)}%\n`;
      }
      if (rightStats.backwardSwing.total > 0) {
        report += `  後擺鬆開一致性: ${rightStats.backwardSwing.consistency.toFixed(1)}%\n`;
      }
      
      if (this.gripStats.coordination.total > 0) {
        report += `\n臂部協調性: ${this.gripStats.coordination.percentage.toFixed(1)}%\n`;
        const coordStatus = this.gripStats.coordination.percentage >= 70 ? '良好協調' : '需改進協調';
        report += `  評估: ${coordStatus}\n`;
      }
      
      report += `\n`;
    }
    
    // Add CoM information
    if (this.comPosition) {
      report += `身體質心位置:\n`;
      report += `--------------------------------\n`;
      report += `  X: ${(this.comPosition.x * 100).toFixed(1)}%\n`;
      report += `  Y: ${(this.comPosition.y * 100).toFixed(1)}%\n\n`;
    }
    
    report += `================================\n`;
    report += `資料點數: ${config.angles[0] ? this.angleStats[config.angles[0].key].values.length : 0}\n`;
    
    // Download as text file
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `nordic-walking-stats-${this.currentView}-${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    
    this.updateStatus('統計數據已匯出');
  },
  
  // Export analysis report
  exportReport() {
    if (!this.currentPose || !this.currentPose.poseLandmarks) {
      alert('請先進行動作分析');
      return;
    }
    
    const angles = this.calculateAngles(this.currentPose.poseLandmarks);
    const config = this.viewConfigs[this.currentView];
    
    let report = `Nordic Walking 動作分析報告\n`;
    report += `================================\n\n`;
    report += `視角: ${config.label}\n`;
    report += `分析時間: ${new Date().toLocaleString('zh-TW')}\n\n`;
    report += `角度數據:\n`;
    report += `--------------------------------\n`;
    
    config.angles.forEach(angleConfig => {
      const value = angles[angleConfig.key];
      const status = value !== null ? this.getAngleStatus(value, angleConfig.range) : 'N/A';
      const statusText = status === 'good' ? '✓' : (status === 'warning' ? '⚠' : '✗');
      report += `${angleConfig.label}: ${value !== null ? value.toFixed(1) + '°' : 'N/A'} ${statusText !== 'N/A' ? statusText : ''}\n`;
      if (value !== null) {
        report += `  建議範圍: ${angleConfig.range[0]}-${angleConfig.range[1]}°\n`;
      }
    });
    
    report += `\n================================\n`;
    report += `報告結束\n`;
    
    // Download as text file
    const blob = new Blob([report], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `nordic-walking-report-${this.currentView}-${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    
    this.updateStatus('報告已匯出');
  },
  
  // Update status indicator
  updateStatus(message, isError = false) {
    // Update header status
    const headerStatus = document.getElementById('headerStatus');
    if (headerStatus) {
      headerStatus.textContent = message.length > 20 ? message.substring(0, 20) + '...' : message;
      headerStatus.style.color = isError ? 'var(--color-error)' : 'var(--color-text-secondary)';
    }
    
    // Update main status indicator (if exists)
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
      indicator.innerHTML = `
        <span class="status-dot"></span>
        <span>${message}</span>
      `;
      
      if (isError) {
        indicator.className = 'status-indicator error';
      } else {
        indicator.className = 'status-indicator';
      }
    }
  }
};

// Dynamically adjust canvas parent aspect-ratio to match source video/camera
app.updateCanvasContainerAspectRatio = function(videoWidth, videoHeight) {
  if (!this.ratioBox) return;
  // Calculate ratio string, avoiding NaN
  if (videoWidth && videoHeight) {
    this.ratioBox.style.aspectRatio = `${videoWidth} / ${videoHeight}`;
    // (Set min-width and min-height for extreme aspect ratios, if desired)
  } else {
    // Fallback to 16/9
    this.ratioBox.style.aspectRatio = '16 / 9';
  }
};

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Expose app globally for debugging
window.app = app;
