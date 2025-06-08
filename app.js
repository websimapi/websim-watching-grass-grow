import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Game state
const gameState = {
    day: 1,
    hour: 8,
    weather: 'Sunny',
    grassHeight: 0.1,
    grassHealth: 100,
    grassMoisture: 50,
    timeSpeed: 1, // 1 = normal, 2 = 2x speed, etc.
    paused: false,
    growthStage: 0, // 0-100 percentage of growth progress
    lastUpdateTime: 0 // For smooth animations
};

// Audio setup
let audioListener;
let ambientSound;
let waterSound;

function setupAudio() {
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    // Ambient nature sound
    ambientSound = new THREE.Audio(audioListener);
    const ambientAudioLoader = new THREE.AudioLoader();
    ambientAudioLoader.load('ambient-nature.wav', function(buffer) {
        ambientSound.setBuffer(buffer);
        ambientSound.setLoop(true);
        ambientSound.setVolume(0.5);
        ambientSound.play();
    });

    // Water sound effect
    waterSound = new THREE.Audio(audioListener);
    const waterAudioLoader = new THREE.AudioLoader();
    waterAudioLoader.load('water-sound.wav', function(buffer) {
        waterSound.setBuffer(buffer);
        waterSound.setLoop(false);
        waterSound.setVolume(0.7);
    });
}

// Constants
const GRASS_GROWTH_RATE = 0.0005; // Slowed down for more realistic growth
const MOISTURE_LOSS_RATE = 0.3;  // Slowed down moisture loss
const LAWN_SIZE = 20;            // Size of the lawn (width and depth)
const GRASS_DENSITY = 40000;     // Increased number of grass blades

// Improved growth model constants
const GROWTH_STAGES = [
    { height: 0.05, thickness: 0.03, color: [120/360, 0.4, 0.3] }, // Seedling
    { height: 0.15, thickness: 0.04, color: [110/360, 0.5, 0.35] }, // Young
    { height: 0.3, thickness: 0.05, color: [100/360, 0.6, 0.35] },  // Growing
    { height: 0.6, thickness: 0.06, color: [90/360, 0.65, 0.3] },   // Mature
    { height: 0.8, thickness: 0.06, color: [85/360, 0.7, 0.28] },   // Full-grown
    { height: 1.0, thickness: 0.06, color: [80/360, 0.6, 0.3] }     // Ready to mow
];

// Define growth stage names
const GROWTH_STAGE_NAMES = [
    "Seedling",      // 0-15%
    "Sprouting",     // 15-30%
    "Young Grass",   // 30-50%
    "Growing",       // 50-70%
    "Maturing",      // 70-85%
    "Lush Growth",   // 85-95%
    "Ready to Mow"   // 95-100%
];

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
document.getElementById('game-container').appendChild(renderer.domElement);

// Camera position
camera.position.set(5, 3, 5);
camera.lookAt(0, 0, 0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 3;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below ground
controls.minPolarAngle = Math.PI / 6;       // Prevent going too high

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 15, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);

// Sky
const sky = new Sky();
sky.scale.setScalar(450);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 2;
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.8;

const sun = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(90 - 5);
const theta = THREE.MathUtils.degToRad(180);
sun.setFromSphericalCoords(1, phi, theta);
skyUniforms['sunPosition'].value.copy(sun);

// Enhanced ground with texture and bumps
const groundGeometry = new THREE.PlaneGeometry(LAWN_SIZE, LAWN_SIZE, 64, 64);

// Add some terrain bumps for realism
for (let i = 0; i < groundGeometry.attributes.position.count; i++) {
    const x = groundGeometry.attributes.position.getX(i);
    const z = groundGeometry.attributes.position.getZ(i);
    
    // Add subtle height variations
    const height = Math.sin(x * 0.5) * 0.1 + Math.sin(z * 0.3) * 0.1;
    groundGeometry.attributes.position.setY(i, height);
}

// Update normals after modifying the geometry
groundGeometry.computeVertexNormals();

// Create a more detailed ground material
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x553311, // Soil color
    roughness: 0.9,
    metalness: 0.1,
    flatShading: false
});

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Create a more realistic grass blade geometry
function createGrassBladeGeometry() {
    const geometry = new THREE.BufferGeometry();
    
    // Create a tapered blade shape with a curved tip
    const points = [];
    const width = 0.05;
    const height = 0.3;
    const segments = 6;
    
    // Left side points (bottom to top)
    for (let i = 0; i <= segments; i++) {
        const y = (i / segments) * height;
        // Taper the width as we go up
        const x = -width * (1 - (i / segments) * 0.9);
        // Add a slight curve to the blade
        const z = Math.pow(i / segments, 2) * 0.05;
        points.push(new THREE.Vector3(x, y, z));
    }
    
    // Right side points (top to bottom)
    for (let i = segments; i >= 0; i--) {
        const y = (i / segments) * height;
        // Taper the width as we go up
        const x = width * (1 - (i / segments) * 0.9);
        // Add a slight curve to the blade
        const z = Math.pow(i / segments, 2) * 0.05;
        points.push(new THREE.Vector3(x, y, z));
    }
    
    // Convert points to vertices and create faces
    const vertices = [];
    const indices = [];
    const uvs = [];
    
    // Add vertices
    for (let i = 0; i < points.length; i++) {
        vertices.push(points[i].x, points[i].y, points[i].z);
        
        // Add UVs
        uvs.push(i / (points.length - 1), i <= segments ? i / segments : 1 - ((i - segments - 1) / segments));
    }
    
    // Add indices for triangles
    for (let i = 0; i < points.length - 2; i++) {
        // Skip connecting the last point to the first point
        if (i !== segments) {
            indices.push(i, i + 1, i + 2);
        }
    }
    
    // Create the buffers
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // Compute normals for proper lighting
    geometry.computeVertexNormals();
    
    return geometry;
}

// Create a basic shape for performance if device is low-end
function createSimpleGrassGeometry() {
    return new THREE.PlaneGeometry(0.08, 0.3);
}

// Choose geometry based on device capability
const isHighPerformanceDevice = window.devicePixelRatio <= 2 && window.innerWidth > 768;
const grassGeometry = isHighPerformanceDevice ? createGrassBladeGeometry() : createSimpleGrassGeometry();
grassGeometry.translate(0, 0.15, 0);

// Improved grass material with subtle translucency
const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x33aa33,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    roughness: 0.75,
    metalness: 0.0,
    flatShading: false
});

const grassInstancedMesh = new THREE.InstancedMesh(
    grassGeometry,
    grassMaterial,
    GRASS_DENSITY
);
grassInstancedMesh.castShadow = true;
grassInstancedMesh.receiveShadow = true;
scene.add(grassInstancedMesh);

// Create grass instances with improved distribution
const dummy = new THREE.Object3D();
const grassPositions = [];

// Create patches of grass for more realistic distribution
const patchCount = 25;
const patchPositions = [];

// Generate patch centers
for (let i = 0; i < patchCount; i++) {
    patchPositions.push({
        x: (Math.random() - 0.5) * LAWN_SIZE * 0.9,
        z: (Math.random() - 0.5) * LAWN_SIZE * 0.9,
        radius: 2 + Math.random() * 3 // Varying patch sizes
    });
}

// Distribute grass within and between patches
for (let i = 0; i < GRASS_DENSITY; i++) {
    let x, z;
    
    // 85% of grass blades are in patches, 15% are randomly distributed
    if (Math.random() < 0.85) {
        // Choose a random patch
        const patch = patchPositions[Math.floor(Math.random() * patchCount)];
        
        // Place within the patch with gaussian-like distribution (denser in the middle)
        const angle = Math.random() * Math.PI * 2;
        const radius = patch.radius * Math.pow(Math.random(), 0.5); // Square root creates more concentration in center
        
        x = patch.x + Math.cos(angle) * radius;
        z = patch.z + Math.sin(angle) * radius;
    } else {
        // Random distribution across the lawn
        x = (Math.random() - 0.5) * LAWN_SIZE;
        z = (Math.random() - 0.5) * LAWN_SIZE;
    }
    
    // Get ground height at this position for more realistic placement
    const heightFactor = Math.sin(x * 0.5) * 0.1 + Math.sin(z * 0.3) * 0.1;
    
    // Store more detailed information for each grass blade
    grassPositions.push({
        x: x,
        z: z,
        y: heightFactor, // Base height from terrain
        initialHeight: 0.1 + Math.random() * 0.05, // Slightly varied initial heights
        currentHeight: 0.1 + Math.random() * 0.05,
        targetHeight: 0.1 + Math.random() * 0.05,
        growthRate: 0.8 + Math.random() * 0.4, // Individual growth rate variation
        swayOffset: Math.random() * Math.PI * 2, // Random sway phase offset
        swayAmount: 0.02 + Math.random() * 0.03, // Reduced sway for less jitter
        swaySpeed: 0.5 + Math.random() * 0.5,    // Varied sway speeds
        rotation: Math.random() * Math.PI * 2,    // Initial rotation
        thickness: 0.03 + Math.random() * 0.02,   // Varied thickness
        // Color variation within the same general hue
        colorVariation: Math.random() * 0.1 - 0.05 // ±5% color variation
    });
    
    // Set initial position and rotation
    dummy.position.set(x, heightFactor, z);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.scale.set(1, 0.1, 1); // Start small
    
    // Apply to instanced mesh
    dummy.updateMatrix();
    grassInstancedMesh.setMatrixAt(i, dummy.matrix);
}

grassInstancedMesh.instanceMatrix.needsUpdate = true;

// Helper function to interpolate between growth stages
function interpolateGrowthStage(stage) {
    // Map the 0-100 growth stage to our predefined growth stages
    const stageIndex = Math.min(Math.floor(stage / 100 * (GROWTH_STAGES.length - 1)), GROWTH_STAGES.length - 2);
    const nextStageIndex = stageIndex + 1;
    
    // Calculate how far we are between current stage and next stage (0-1)
    const stageProgress = (stage / 100 * (GROWTH_STAGES.length - 1)) - stageIndex;
    
    // Get current and next stage definitions
    const currentStage = GROWTH_STAGES[stageIndex];
    const nextStage = GROWTH_STAGES[nextStageIndex];
    
    // Interpolate values between stages
    return {
        height: currentStage.height + (nextStage.height - currentStage.height) * stageProgress,
        thickness: currentStage.thickness + (nextStage.thickness - currentStage.thickness) * stageProgress,
        color: [
            currentStage.color[0] + (nextStage.color[0] - currentStage.color[0]) * stageProgress,
            currentStage.color[1] + (nextStage.color[1] - currentStage.color[1]) * stageProgress,
            currentStage.color[2] + (nextStage.color[2] - currentStage.color[2]) * stageProgress
        ]
    };
}

// UI functions
function updateUI() {
    // Update time display
    const hourString = Math.floor(gameState.hour).toString().padStart(2, '0');
    const minuteString = Math.floor((gameState.hour % 1) * 60).toString().padStart(2, '0');
    document.getElementById('time-display').textContent = `Day ${gameState.day}, ${hourString}:${minuteString}`;
    
    // Update weather display
    document.getElementById('weather-display').textContent = gameState.weather;
    
    // Update growth stage text
    const stageIndex = Math.min(Math.floor(gameState.growthStage / 100 * GROWTH_STAGE_NAMES.length), GROWTH_STAGE_NAMES.length - 1);
    document.getElementById('growth-stage-text').textContent = GROWTH_STAGE_NAMES[stageIndex];
    
    // Color the growth stage text based on the stage
    const growthTextElement = document.getElementById('growth-stage-text');
    
    // Change color based on growth stage
    if (gameState.growthStage < 30) {
        growthTextElement.style.color = '#AED581'; // Light green for young grass
    } else if (gameState.growthStage < 70) {
        growthTextElement.style.color = '#8BC34A'; // Medium green for growing grass
    } else if (gameState.growthStage < 90) {
        growthTextElement.style.color = '#689F38'; // Darker green for mature grass
    } else {
        growthTextElement.style.color = '#558B2F'; // Deep green for fully grown grass
    }
    
    // Update stat bars
    document.getElementById('growth-bar').style.width = `${gameState.growthStage}%`;
    document.getElementById('health-bar').style.width = `${gameState.grassHealth}%`;
    document.getElementById('moisture-bar').style.width = `${gameState.grassMoisture}%`;
}

// Game logic functions
function updateGrassAppearance() {
    const currentTime = performance.now() * 0.001;
    const deltaTime = Math.min(0.1, currentTime - gameState.lastUpdateTime); // Cap delta time to avoid large jumps
    gameState.lastUpdateTime = currentTime;
    
    // Get current growth stage properties
    const stageProps = interpolateGrowthStage(gameState.growthStage);
    
    // Update grass material base color from growth stage
    const healthFactor = gameState.grassHealth / 100;
    const moistureFactor = gameState.grassMoisture / 100;
    
    // Apply health and moisture modifiers to the base color
    let [hue, saturation, lightness] = stageProps.color;
    
    // Health affects hue and saturation - unhealthy grass is more yellow and less saturated
    hue += (1 - healthFactor) * 0.1; // Shift toward yellow when unhealthy
    saturation *= 0.5 + (healthFactor * 0.5); // Reduce saturation when unhealthy
    
    // Moisture affects lightness - dry grass is lighter
    lightness += (1 - moistureFactor) * 0.1;
    
    // Set the material color
    grassMaterial.color.setHSL(hue, saturation, lightness);
    
    // Update each grass blade with smooth transitions
    for (let i = 0; i < GRASS_DENSITY; i++) {
        const grass = grassPositions[i];
        
        // Calculate target height based on current growth stage, with individual variation
        const targetHeight = stageProps.height * grass.growthRate;
        
        // Smooth transition to target height (slower than before for less jitter)
        grass.currentHeight += (targetHeight - grass.currentHeight) * (0.5 * deltaTime);
        
        // Calculate wind effect
        // Use a more complex wind model with multiple frequencies
        const windTime = currentTime * grass.swaySpeed;
        const primaryWind = Math.sin(windTime + grass.swayOffset) * grass.swayAmount;
        const secondaryWind = Math.sin(windTime * 0.4 + grass.swayOffset * 2.7) * (grass.swayAmount * 0.3);
        const tertiaryWind = Math.sin(windTime * 1.7 + grass.swayOffset * 0.8) * (grass.swayAmount * 0.1);
        const combinedWind = primaryWind + secondaryWind + tertiaryWind;
        
        // Calculate blade thickness based on growth stage
        const bladeThickness = stageProps.thickness * (0.8 + (grass.thickness - 0.04) * 5); // Apply individual variation
        
        // Apply transformations
        dummy.position.set(grass.x, grass.y, grass.z);
        dummy.scale.set(
            bladeThickness, // Width varies with growth
            grass.currentHeight / 0.3, // Height based on current state
            bladeThickness  // Depth same as width
        );
        
        // Apply rotation: base rotation + wind effect
        // Use Euler angles for more precise control
        dummy.rotation.set(
            combinedWind * 0.2, // Subtle forward/backward tilt
            grass.rotation,     // Base rotation around Y axis
            combinedWind        // Main side-to-side wind effect
        );
        
        dummy.updateMatrix();
        grassInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    grassInstancedMesh.instanceMatrix.needsUpdate = true;
}

function updateSunPosition() {
    // Calculate sun position based on time of day (hour)
    const timeOfDay = gameState.hour / 24;
    const phi = THREE.MathUtils.degToRad(90 - ((1 - Math.cos(timeOfDay * Math.PI * 2)) * 45));
    const theta = THREE.MathUtils.degToRad(timeOfDay * 360 + 180);
    
    sun.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sun);
    
    // Update directional light to match sun position
    directionalLight.position.set(sun.x * 15, sun.y * 15, sun.z * 15);
    
    // Adjust light intensity based on time of day
    const dayIntensity = Math.sin(timeOfDay * Math.PI);
    directionalLight.intensity = Math.max(0.1, dayIntensity);
    ambientLight.intensity = 0.2 + (dayIntensity * 0.3);
    
    // Night time - darken the sky
    if (gameState.hour < 6 || gameState.hour > 18) {
        skyUniforms['turbidity'].value = 5;
        skyUniforms['rayleigh'].value = 1;
    } else {
        skyUniforms['turbidity'].value = 10;
        skyUniforms['rayleigh'].value = 2;
    }
}

function updateGameTime() {
    if (gameState.paused) return;
    
    const currentTime = performance.now() * 0.001;
    const deltaTime = Math.min(0.1, currentTime - gameState.lastUpdateTime); // Cap delta time
    
    // Update game time more smoothly using delta time
    gameState.hour += deltaTime * gameState.timeSpeed / 30; // Slower time progression (30 real seconds = 1 game hour)
    
    if (gameState.hour >= 24) {
        gameState.hour = 0;
        gameState.day++;
    }
    
    // Update sun position
    updateSunPosition();
    
    // Growth model based on realistic grass growing conditions
    if (gameState.hour >= 6 && gameState.hour <= 18) { // Only grow during daylight
        // Growth factors: health, moisture, and sunlight (based on time of day)
        const sunlightFactor = Math.sin((gameState.hour - 6) / 12 * Math.PI); // Peak at noon
        const growthFactor = (gameState.grassHealth / 100) * (gameState.grassMoisture / 100) * sunlightFactor;
        
        // Update growth stage (percentage of full growth)
        gameState.growthStage += GRASS_GROWTH_RATE * growthFactor * gameState.timeSpeed * deltaTime * 100;
        
        // Cap maximum growth
        if (gameState.growthStage > 100) {
            gameState.growthStage = 100;
        }
    }
    
    // More realistic moisture loss - more during hot midday hours, less at night
    let timeBasedMoistureLoss = MOISTURE_LOSS_RATE;
    if (gameState.hour > 10 && gameState.hour < 16) {
        // More evaporation during hottest part of day
        timeBasedMoistureLoss *= 1.5;
    } else if (gameState.hour < 6 || gameState.hour > 18) {
        // Less evaporation at night
        timeBasedMoistureLoss *= 0.5;
    }
    
    gameState.grassMoisture -= timeBasedMoistureLoss * gameState.timeSpeed * deltaTime;
    if (gameState.grassMoisture < 0) gameState.grassMoisture = 0;
    
    // Health is affected by moisture
    if (gameState.grassMoisture < 20) {
        // Grass health decreases faster when very dry
        gameState.grassHealth -= 0.2 * gameState.timeSpeed * deltaTime;
        if (gameState.grassHealth < 0) gameState.grassHealth = 0;
    } else if (gameState.grassHealth < 100 && gameState.grassMoisture > 40) {
        // Grass health recovers when well-watered
        gameState.grassHealth += 0.1 * gameState.timeSpeed * deltaTime;
        if (gameState.grassHealth > 100) gameState.grassHealth = 100;
    }
    
    // Update UI
    updateUI();
}

// Initialize tool buttons
function initializeButtons() {
    document.getElementById('water-btn').addEventListener('click', () => {
        gameState.grassMoisture += 30;
        if (gameState.grassMoisture > 100) gameState.grassMoisture = 100;
        updateUI();
        
        // Play water sound
        if (waterSound && waterSound.buffer) {
            waterSound.play();
        }
    });
    
    document.getElementById('fertilize-btn').addEventListener('click', () => {
        gameState.grassHealth += 15;
        if (gameState.grassHealth > 100) gameState.grassHealth = 100;
        
        // Fertilizer also provides a small growth boost
        gameState.growthStage += 2;
        if (gameState.growthStage > 100) gameState.growthStage = 100;
        
        updateUI();
    });
    
    document.getElementById('mow-btn').addEventListener('click', () => {
        if (gameState.growthStage > 40) { // Only mow if grass is tall enough
            gameState.growthStage = 20; // Mow to a short but not seedling height
            updateGrassAppearance();
            updateUI();
        }
    });
    
    document.getElementById('seed-btn').addEventListener('click', () => {
        gameState.grassHealth += 10;
        if (gameState.grassHealth > 100) gameState.grassHealth = 100;
        
        // Add a small boost to growth as well
        gameState.growthStage += 5;
        if (gameState.growthStage > 100) gameState.growthStage = 100;
        
        updateUI();
    });
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    updateGrassAppearance();
    updateGameTime();
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Loading simulation
function simulateLoading() {
    const loadingBar = document.querySelector('.loading-bar');
    let progress = 0;
    
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 100) progress = 100;
        
        loadingBar.style.width = `${progress}%`;
        
        if (progress === 100) {
            clearInterval(interval);
            setTimeout(() => {
                document.getElementById('loading-screen').style.opacity = '0';
                setTimeout(() => {
                    document.getElementById('loading-screen').style.display = 'none';
                }, 1000);
            }, 500);
        }
    }, 200);
}

// Initialize the game
function init() {
    simulateLoading();
    setupAudio();
    initializeButtons();
    gameState.lastUpdateTime = performance.now() * 0.001;
    updateUI();
    animate();
}

// Start the game
init();