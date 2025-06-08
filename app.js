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
    paused: false
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
const GRASS_GROWTH_RATE = 0.002; // How fast grass grows per game hour
const MOISTURE_LOSS_RATE = 0.5;  // How much moisture is lost per game hour
const LAWN_SIZE = 20;            // Size of the lawn (width and depth)
const GRASS_DENSITY = 30000;     // Number of grass blades

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
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

// Ground
const groundGeometry = new THREE.PlaneGeometry(LAWN_SIZE, LAWN_SIZE, 32, 32);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x553311, // Soil color
    roughness: 0.8,
    metalness: 0.2
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grass instanced mesh
const instancedGrassGeometry = new THREE.PlaneGeometry(0.1, 0.3);
instancedGrassGeometry.translate(0, 0.15, 0);

const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x33aa33,
    side: THREE.DoubleSide,
    alphaTest: 0.5
});

const grassInstancedMesh = new THREE.InstancedMesh(
    instancedGrassGeometry,
    grassMaterial,
    GRASS_DENSITY
);
grassInstancedMesh.castShadow = true;
grassInstancedMesh.receiveShadow = true;
scene.add(grassInstancedMesh);

// Create grass instances
const dummy = new THREE.Object3D();
const grassPositions = [];

for (let i = 0; i < GRASS_DENSITY; i++) {
    // Random position within the lawn area
    const x = (Math.random() - 0.5) * LAWN_SIZE;
    const z = (Math.random() - 0.5) * LAWN_SIZE;

    // Store position for later updates
    grassPositions.push({
        x: x,
        z: z,
        height: 0.1 + Math.random() * 0.1, // Initial height variation
        swayOffset: Math.random() * Math.PI * 2, // Random sway phase offset
        swayAmount: 0.05 + Math.random() * 0.05  // Random sway amount
    });

    // Set position
    dummy.position.set(x, 0, z);

    // Random rotation around Y axis
    dummy.rotation.y = Math.random() * Math.PI;

    // Apply to instanced mesh
    dummy.updateMatrix();
    grassInstancedMesh.setMatrixAt(i, dummy.matrix);
}

grassInstancedMesh.instanceMatrix.needsUpdate = true;

// UI functions
function updateUI() {
    // Update time display
    const hourString = gameState.hour.toString().padStart(2, '0');
    document.getElementById('time-display').textContent = `Day ${gameState.day}, ${hourString}:00`;

    // Update weather display
    document.getElementById('weather-display').textContent = gameState.weather;

    // Update stat bars
    document.getElementById('growth-bar').style.width = `${Math.min(100, (gameState.grassHeight / 1) * 100)}%`;
    document.getElementById('health-bar').style.width = `${gameState.grassHealth}%`;
    document.getElementById('moisture-bar').style.width = `${gameState.grassMoisture}%`;
}

// Game logic functions
function updateGrassAppearance() {
    // Update grass blade heights and colors based on game state
    const healthFactor = gameState.grassHealth / 100;
    const moistureFactor = gameState.grassMoisture / 100;

    // Calculate grass color based on health and moisture
    const hue = 90 + (30 * (1 - healthFactor)); // 90 (green) to 120 (yellow-green)
    const saturation = 50 + (30 * healthFactor * moistureFactor);
    const lightness = 35 + (10 * (1 - moistureFactor));

    grassMaterial.color.setHSL(hue/360, saturation/100, lightness/100);

    // Update each grass blade
    for (let i = 0; i < GRASS_DENSITY; i++) {
        const grass = grassPositions[i];

        // Calculate current grass height based on growth and health
        const targetHeight = gameState.grassHeight * (0.8 + Math.random() * 0.4) * healthFactor;
        grass.height = grass.height * 0.95 + targetHeight * 0.05; // Smooth transition

        // Add wind sway effect
        const time = performance.now() * 0.001;
        const swayX = Math.sin(time + grass.swayOffset) * grass.swayAmount * grass.height;

        // Apply transformations
        dummy.position.set(grass.x, 0, grass.z);
        dummy.scale.set(1, grass.height / 0.3, 1); // Scale y-axis for height
        dummy.rotation.set(0, Math.random() * Math.PI * 2, swayX);

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

    // Update game time
    gameState.hour += 1 * gameState.timeSpeed / 60; // Advance time (each real second = 1 minute of game time)

    if (gameState.hour >= 24) {
        gameState.hour = 0;
        gameState.day++;
    }

    // Update sun position
    updateSunPosition();

    // Handle grass growth and health
    if (gameState.hour >= 6 && gameState.hour <= 18) { // Only grow during daylight
        // Growth is affected by health and moisture
        const growthFactor = (gameState.grassHealth / 100) * (gameState.grassMoisture / 100);
        gameState.grassHeight += GRASS_GROWTH_RATE * growthFactor * gameState.timeSpeed / 60;

        // Cap maximum grass height
        if (gameState.grassHeight > 1) {
            gameState.grassHeight = 1;
        }
    }

    // Decrease moisture over time
    gameState.grassMoisture -= MOISTURE_LOSS_RATE * gameState.timeSpeed / 60;
    if (gameState.grassMoisture < 0) gameState.grassMoisture = 0;

    // Health is affected by moisture
    if (gameState.grassMoisture < 20) {
        gameState.grassHealth -= 0.2 * gameState.timeSpeed / 60;
        if (gameState.grassHealth < 0) gameState.grassHealth = 0;
    } else if (gameState.grassHealth < 100 && gameState.grassMoisture > 40) {
        gameState.grassHealth += 0.1 * gameState.timeSpeed / 60;
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
        updateUI();
    });

    document.getElementById('mow-btn').addEventListener('click', () => {
        if (gameState.grassHeight > 0.3) {
            gameState.grassHeight = 0.3;
            updateGrassAppearance();
            updateUI();
        }
    });

    document.getElementById('seed-btn').addEventListener('click', () => {
        // Add more grass density (not implemented in this version)
        gameState.grassHealth += 10;
        if (gameState.grassHealth > 100) gameState.grassHealth = 100;
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
    updateUI();
    animate();
}

// Start the game
init();