// Nordic Walking Motion Analyzer - Multi-Angle View
const app = {
  // State
  currentView: 'front',
  showGroundLine: true,
  showVerticalLine: true,
  showSkeleton: true,
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
  poleStats: {
    leftTouchAngle: { current: 0, max: 0, min: Infinity, values: [], average: 0 },
    rightTouchAngle: { current: 0, max: 0, min: Infinity, values: [], average: 0 },
    poleStridePosition: { current: 0, max: 0, min: Infinity, values: [], average: 0 }
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
      
      // Draw walking poles (dashed lines)
      this.drawWalkingPoles(ctx, canvas, results.poseLandmarks);
      
      // Draw center of mass
      this.drawCenterOfMass(ctx, canvas, results.poseLandmarks);
      
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

   /* =============================================================================
    NORDIC WALKING POLE BIOMECHANICS SPECIFICATION
    
    用戶指導：健走杖應該持續追蹤影片並即時計算，手臂與健走杖的運動關係應該是這樣：
    前擺手在手掌擺動至腰部高度時，前手掌握杖往身體行進方向的後下方將杖刺入雙腳步幅
    中間(步幅的計算是由前腳腳根至後腳腳尖)地面。健走杖在運動全程並不會跑到身體前方。
    
    KEY BIOMECHANICAL REQUIREMENTS:
    1. 手臂搖擺週期（ARM SWING CYCLE）：
       - 手臂前擺時：掌握重點在於手掌擺動至腰部高度時
       - 此時健走杖應該從握點指向身體行進方向的後下方
       - 杖不應該出現在身體前方的任何時候
       
    2. 杖刺入位置（POLE INSERTION POINT）：
       - 杖必須刺入在雙腳步幅的中間位置
       - 步幅定義：前腳腳根到後腳腳尖的距離
       - 步幅中間點 = (前腳根X位置 + 後腳尖X位置) / 2
       - 允許誤差範圍：±10 cm（可根據個人步幅調整）
       
    3. 杖角度限制（POLE ANGLE CONSTRAINTS）：
       - 杖必須始終保持向下指向地面（不能向上指向身體前方）
       - 健走時杖與垂直線的角度應該在 30-50 度之間
       - 角度過大（>60°）表示杖在身體前方，需要調整
       - 角度過小（<20°）表示杖接近垂直，不符合自然擺動
       
    4. 手臂與杖同步（ARM-POLE SYNCHRONIZATION）：
       - 當手臂向前擺時，杖應該也向前傾斜
       - 生物力學補正值：
         * 前擺時：杖應比前臂多傾斜 15-20 度（考慮手臂長度和杖點角度差異）
         * 後擺時：杖應比後臂多傾斜 10-15 度
    
    CURRENT CALCULATION ISSUES:
    
    問題1：「杖尖觸地角度」計算邏輯
    - 當前計算方式：armAngleFromVertical + biomechanicsOffset
    - 生物力學補正未考慮：
      a) 手臂長度的變化
      b) 手腕與握點的位置差異
      c) 杖長度的標準化因素
      d) 視角轉換的影響（正面/側面視角差異）
    
    問題2：「杖尖相對步幅位置」計算邏輯
    - 當前計算方式：簡單計算杖尖與前腳腳根之間的距離
    - 缺陷：
      a) 未正確計算步幅中間點（應該是前腳根到後腳尖的中點）
      b) 沒有考慮步幅的邊界檢查
      c) 在轉身或調整姿勢時可能不穩定
    
    問題3：杖位置邊界檢查缺失
    - 當前沒有檢查杖是否出現在身體前方
    - 需要添加：杖X位置不能超過身體中線向前的限制
    
    ============================================================================= */
  // Draw walking poles with dashed lines - CORRECTED BIOMECHANICS
  drawWalkingPoles(ctx, canvas, landmarks) {
    // Get key landmarks for calculating hand grip position
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const leftHand = landmarks[21];
    
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    const rightHand = landmarks[22];
    
    // Calculate ground plane Y position
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const groundY = leftAnkle && rightAnkle ? Math.max(leftAnkle.y, rightAnkle.y) * canvas.height : canvas.height;
    
    // Draw left pole (red, dashed)
    if (leftShoulder && leftElbow && leftWrist && leftHand && 
        leftWrist.visibility > 0.5 && leftElbow.visibility > 0.5) {
      
      // Calculate hand grip position (between wrist and hand, slightly adjusted)
      // Use weighted average closer to wrist for grip point
      const gripX = (leftWrist.x * 0.7 + leftHand.x * 0.3) * canvas.width;
      const gripY = (leftWrist.y * 0.7 + leftHand.y * 0.3) * canvas.height;
      
      // Calculate forearm vector direction (from elbow to wrist)
      const forearmVectorX = leftWrist.x - leftElbow.x;
      const forearmVectorY = leftWrist.y - leftElbow.y;
      
      // Calculate pole direction: extend from grip downward and forward
      // 使用 atan2 得到從垂直（向下）方向的角度偏離量
      const armAngleFromVertical = Math.atan2(forearmVectorX, Math.abs(forearmVectorY)) * 180 / Math.PI;

      // 4. 應用生物力學調整：
      // - 前擺時（armAngleFromVertical > 0）：杖應比手臂多向前傾約 15-20 度
      // - 後擺時（armAngleFromVertical < 0）：杖應比手臂多向後傾約 10-15 度
      const biomechanicsOffset = armAngleFromVertical > 0 ? 18 : -12;
      const poleAngle = armAngleFromVertical + biomechanicsOffset;

      // 5. 計算杖從握點到地面的長度
      const poleLength = groundY - gripY;
      
      // Determine forward direction based on view
      let forwardDirection = 1;
      if (this.currentView === 'left') {
        forwardDirection = -1; // Forward is to the left
      } else if (this.currentView === 'right') {
        forwardDirection = 1; // Forward is to the right
      } else if (this.currentView === 'front') {
        // Use hand position relative to shoulder for forward/back determination
        forwardDirection = leftHand.z < leftShoulder.z ? 1 : -1;
      } else if (this.currentView === 'back') {
        forwardDirection = leftHand.z > leftShoulder.z ? 1 : -1;
      }
      
      // 7. 計算杖尖接地位置
      const poleAngleRad = poleAngle * Math.PI / 180;
      const horizontalOffset = poleLength * Math.tan(poleAngleRad) * forwardDirection;
      const poleEndX = gripX + horizontalOffset;
      const poleEndY = groundY;
      
      // Draw dashed line from grip to ground contact
      ctx.strokeStyle = '#FF0000'; // Red for left pole
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(gripX, gripY);
      ctx.lineTo(poleEndX, poleEndY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Calculate actual pole angle from vertical
      const dx = poleEndX - gripX;
      const dy = poleEndY - gripY;
      const actualAngle = Math.abs(Math.atan2(Math.abs(dx), dy) * 180 / Math.PI);
      this.updatePoleStats('leftTouchAngle', actualAngle);
      
      // Calculate pole position relative to stride (lateral views)
      if (this.currentView === 'left' || this.currentView === 'right') {
        this.updatePoleStridePosition(landmarks, poleEndX, 'left');
      }
    }
    
    // Draw right pole (green, dashed)
    if (rightShoulder && rightElbow && rightWrist && rightHand && 
        rightWrist.visibility > 0.5 && rightElbow.visibility > 0.5) {
      
      // Calculate hand grip position (between wrist and hand, slightly adjusted)
      const gripX = (rightWrist.x * 0.7 + rightHand.x * 0.3) * canvas.width;
      const gripY = (rightWrist.y * 0.7 + rightHand.y * 0.3) * canvas.height;
      
      // Calculate forearm vector direction (from elbow to wrist)
      const forearmVectorX = rightWrist.x - rightElbow.x;
      const forearmVectorY = rightWrist.y - rightElbow.y;
      
      // 3. 計算前臂角度
      const armAngleFromVertical = Math.atan2(forearmVectorX, Math.abs(forearmVectorY)) * 180 / Math.PI;

      // 4. 應用生物力學調整
      const biomechanicsOffset = armAngleFromVertical > 0 ? 18 : -12;
      const poleAngle = armAngleFromVertical + biomechanicsOffset;

      // 5. 計算杖長度
      const poleLength = groundY - gripY;
      
      // Determine forward direction based on view
      let forwardDirection = 1;
      if (this.currentView === 'left') {
        forwardDirection = -1; // Forward is to the left
      } else if (this.currentView === 'right') {
        forwardDirection = 1; // Forward is to the right
      } else if (this.currentView === 'front') {
      // Use hand position relative to shoulder for forward/back determination
        forwardDirection = rightHand.z < rightShoulder.z ? 1 : -1;
      } else if (this.currentView === 'back') {
        forwardDirection = rightHand.z > rightShoulder.z ? 1 : -1;
      }
      
      // 7. 計算杖尖接地位置
            const poleAngleRad = poleAngle * Math.PI / 180;
            const horizontalOffset = poleLength * Math.tan(poleAngleRad) * forwardDirection;
            const poleEndX = gripX + horizontalOffset;
            const poleEndY = groundY;
      
      // Draw dashed line from grip to ground contact
      ctx.strokeStyle = '#00FF00'; // Green for right pole
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(gripX, gripY);
      ctx.lineTo(poleEndX, poleEndY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Calculate actual pole angle from vertical
      const dx = poleEndX - gripX;
      const dy = poleEndY - gripY;
      const actualAngle = Math.abs(Math.atan2(Math.abs(dx), dy) * 180 / Math.PI);
      this.updatePoleStats('rightTouchAngle', actualAngle);
      
      // Calculate pole position relative to stride (lateral views)
      if (this.currentView === 'left' || this.currentView === 'right') {
        this.updatePoleStridePosition(landmarks, poleEndX, 'right');
      }
    }
  },
  
  // Update pole statistics
  updatePoleStats(key, value) {
    if (value === null || isNaN(value)) return;
    
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
  
  // Update pole stride position
  updatePoleStridePosition(landmarks, poleEndX, side) {
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    if (leftAnkle && rightAnkle && leftAnkle.visibility > 0.5 && rightAnkle.visibility > 0.5) {
      const leftAnkleX = leftAnkle.x * this.canvasElement.width;
      const rightAnkleX = rightAnkle.x * this.canvasElement.width;
      
      // Find forward foot (depends on view direction)
      let forwardFootX;
      if (this.currentView === 'left') {
        forwardFootX = Math.min(leftAnkleX, rightAnkleX); // Leftmost foot is forward
      } else {
        forwardFootX = Math.max(leftAnkleX, rightAnkleX); // Rightmost foot is forward
      }
      
      // Calculate distance in pixels, then convert to cm
      const distancePixels = Math.abs(poleEndX - forwardFootX);
      const distanceCm = distancePixels / this.pixelsPerCm;
      
      this.updatePoleStats('poleStridePosition', distanceCm);
    }
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
    angles.trunkLean = Math.abs(trunkAngle * 180 / Math.PI);      }
      
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
      angleItem.style.cssText = 'margin-bottom: 12px;';
      
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
      
      // Statistics row
      if (stats.values.length > 0) {
        const statsRow = document.createElement('div');
        statsRow.className = 'stats-row';
        
        const statTypes = [
          { label: '最大', value: stats.max },
          { label: '最小', value: stats.min },
          { label: '平均', value: stats.average }
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
    
    // Add pole statistics
    if (this.poleStats.leftTouchAngle.values.length > 0 || this.poleStats.rightTouchAngle.values.length > 0) {
      const poleAngleItem = document.createElement('div');
      poleAngleItem.style.cssText = 'margin-top: 12px;';
      
      const mainRow = document.createElement('div');
      mainRow.className = 'angle-item';
      
      const poleName = document.createElement('span');
      poleName.className = 'angle-name';
      poleName.textContent = '杖尖觸地角度';
      
      const poleValue = document.createElement('span');
      poleValue.className = 'angle-value current';
      const leftAngle = this.poleStats.leftTouchAngle.current || 0;
      const rightAngle = this.poleStats.rightTouchAngle.current || 0;
      const avgAngle = (leftAngle + rightAngle) / 2;
      poleValue.textContent = `${avgAngle.toFixed(1)}°`;
      
      mainRow.appendChild(poleName);
      mainRow.appendChild(poleValue);
      poleAngleItem.appendChild(mainRow);
      
      // Statistics row
      const statsRow = document.createElement('div');
      statsRow.className = 'stats-row';
      
      const leftStats = this.poleStats.leftTouchAngle;
      const rightStats = this.poleStats.rightTouchAngle;
      const combinedValues = [...leftStats.values, ...rightStats.values];
      
      if (combinedValues.length > 0) {
        const maxAngle = Math.max(...combinedValues);
        const minAngle = Math.min(...combinedValues);
        const avgCombined = combinedValues.reduce((a, b) => a + b, 0) / combinedValues.length;
        
        const statTypes = [
          { label: '最大', value: maxAngle },
          { label: '最小', value: minAngle },
          { label: '平均', value: avgCombined }
        ];
        
        statTypes.forEach(stat => {
          const statBox = document.createElement('div');
          statBox.className = 'stat-box';
          
          const statLabel = document.createElement('span');
          statLabel.className = 'stat-label';
          statLabel.textContent = stat.label;
          
          const statValue = document.createElement('span');
          statValue.className = 'stat-value';
          statValue.textContent = `${stat.value.toFixed(1)}°`;
          
          statBox.appendChild(statLabel);
          statBox.appendChild(statValue);
          statsRow.appendChild(statBox);
        });
        
        poleAngleItem.appendChild(statsRow);
      }
      
      angleDisplay.appendChild(poleAngleItem);
    }
    
    // Add pole stride position for lateral views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.poleStats.poleStridePosition.values.length > 0) {
      const poleStrideItem = document.createElement('div');
      poleStrideItem.style.cssText = 'margin-top: 12px;';
      
      const mainRow = document.createElement('div');
      mainRow.className = 'angle-item';
      
      const strideName = document.createElement('span');
      strideName.className = 'angle-name';
      strideName.textContent = '杖尖相對步幅位置';
      
      const strideValue = document.createElement('span');
      strideValue.className = 'angle-value current';
      strideValue.textContent = `${this.poleStats.poleStridePosition.current.toFixed(1)} cm`;
      
      mainRow.appendChild(strideName);
      mainRow.appendChild(strideValue);
      poleStrideItem.appendChild(mainRow);
      
      // Statistics row
      const statsRow = document.createElement('div');
      statsRow.className = 'stats-row';
      
      const stats = this.poleStats.poleStridePosition;
      const statTypes = [
        { label: '最大', value: stats.max },
        { label: '最小', value: stats.min },
        { label: '平均', value: stats.average }
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
      
      poleStrideItem.appendChild(statsRow);
      angleDisplay.appendChild(poleStrideItem);
    }
    
    // Add stride statistics for side views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.strideStats.values.length > 0) {
      const strideItem = document.createElement('div');
      strideItem.style.cssText = 'margin-top: 12px;';
      
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
        { label: '最大', value: this.strideStats.max },
        { label: '最小', value: this.strideStats.min },
        { label: '平均', value: this.strideStats.average }
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
  },
  
  // Set viewing angle
  setView(view) {
    this.currentView = view;
    
    // Update UI
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Pause when switching views
    if (this.isVideoMode && this.isPlaying) {
      this.togglePlayPause();
    }
    
    this.updateStatus(`視角: ${this.viewConfigs[view].label}`);
  },
  
  // Toggle ground line
  toggleGroundLine() {
    this.showGroundLine = document.getElementById('groundLineToggle').checked;
  },
  
  // Toggle vertical line
  toggleVerticalLine() {
    this.showVerticalLine = document.getElementById('verticalLineToggle').checked;
  },
  
  // Toggle skeleton
  toggleSkeleton() {
    this.showSkeleton = document.getElementById('skeletonToggle').checked;
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
    
    this.videoElement.onloadedmetadata = () => {
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;
      
      // Don't auto-play
      this.isVideoMode = true;
      this.isPlaying = false;
      this.videoElement.loop = false; // Single play mode
      
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
    
    // Reset pole statistics
    this.poleStats = {
      leftTouchAngle: { current: 0, max: 0, min: Infinity, values: [], average: 0 },
      rightTouchAngle: { current: 0, max: 0, min: Infinity, values: [], average: 0 },
      poleStridePosition: { current: 0, max: 0, min: Infinity, values: [], average: 0 }
    };
    
    // Reset stride statistics
    this.strideStats = {
      current: 0,
      max: 0,
      min: Infinity,
      values: [],
      average: 0
    };
    
    // Reset CoM
    this.comPosition = null;
    this.comTrail = [];
    
    // Reset frame tracking
    this.currentFrame = 0;
    this.lastProcessedFrame = -1;
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
    
    const timeDisplay = document.getElementById('timeDisplay');
    if (timeDisplay) {
      let displayText = `${formatTime(current)} / ${formatTime(total)}`;
      
      // Show frame number when paused
      if (!this.isPlaying && total > 0) {
        const frameNumber = Math.floor(current * 30); // Assuming 30fps
        displayText += ` (幀 ${frameNumber})`;
      }
      
      timeDisplay.textContent = displayText;
    }
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
    
    // Add pole statistics
    if (this.poleStats.leftTouchAngle.values.length > 0 || this.poleStats.rightTouchAngle.values.length > 0) {
      report += `健走杖觸地角度統計 (度):\n`;
      report += `--------------------------------\n`;
      const leftStats = this.poleStats.leftTouchAngle;
      const rightStats = this.poleStats.rightTouchAngle;
      const combinedValues = [...leftStats.values, ...rightStats.values];
      
      if (combinedValues.length > 0) {
        const maxAngle = Math.max(...combinedValues);
        const minAngle = Math.min(...combinedValues);
        const avgAngle = combinedValues.reduce((a, b) => a + b, 0) / combinedValues.length;
        
        report += `  最大: ${maxAngle.toFixed(1)}°\n`;
        report += `  最小: ${minAngle.toFixed(1)}°\n`;
        report += `  平均: ${avgAngle.toFixed(1)}°\n`;
        report += `  建議範圍: 30-50°\n\n`;
      }
    }
    
    // Add pole stride position for lateral views
    if ((this.currentView === 'left' || this.currentView === 'right') && this.poleStats.poleStridePosition.values.length > 0) {
      report += `杖尖相對步幅位置統計 (公分):\n`;
      report += `--------------------------------\n`;
      const stats = this.poleStats.poleStridePosition;
      report += `  即時: ${stats.current.toFixed(1)} cm\n`;
      report += `  最大: ${stats.max.toFixed(1)} cm\n`;
      report += `  最小: ${stats.min.toFixed(1)} cm\n`;
      report += `  平均: ${stats.average.toFixed(1)} cm\n\n`;
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
    const indicator = document.getElementById('statusIndicator');
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
};

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Expose app globally for debugging
window.app = app;
