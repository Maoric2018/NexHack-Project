// Use dynamic imports to avoid SSR crash

// Singleton to manage the detector model
class MoveNetDetector {
    private detector: any = null; // Use any to avoid hard typing issues with dynamic import
    private isLoading: boolean = false;
    private tf: any = null;
    private poseDetection: any = null;

    async initialize() {
        if (this.detector || this.isLoading) return;
        this.isLoading = true;

        try {
            // dynamic imports
            this.tf = await import('@tensorflow/tfjs-core');
            await import('@tensorflow/tfjs-backend-webgl');
            this.poseDetection = await import('@tensorflow-models/pose-detection');

            await this.tf.ready();
            // Ensure WebGL is used for max performance
            await this.tf.setBackend('webgl');
            console.log("TF Backend:", this.tf.getBackend());

            const model = this.poseDetection.SupportedModels.MoveNet;
            const detectorConfig = {
                modelType: this.poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, // Higher accuracy
                enableSmoothing: true,
                minPoseScore: 0.15 // Lower threshold to detect more poses
            };

            this.detector = await this.poseDetection.createDetector(model, detectorConfig);
            console.log("MoveNet Detector initialized");
        } catch (error) {
            console.error("Failed to initialize MoveNet:", error);
        } finally {
            this.isLoading = false;
        }
    }

    async estimatePoses(video: HTMLVideoElement) {
        if (!this.detector) return null;
        try {
            const poses = await this.detector.estimatePoses(video, {
                maxPoses: 1,
                flipHorizontal: false // We handle flipping in CSS/Canvas
            });
            return poses.length > 0 ? poses[0] : null;
        } catch (e) {
            console.error("Estimation error:", e);
            return null;
        }
    }
}

export const moveNet = new MoveNetDetector();

// Mapper: MoveNet (17 points) -> MediaPipe (33 points) format
export function mapMoveNetToMediaPipe(keypoints: any[], width: number, height: number) {
    // Create empty array of 33 points
    const landmarks = new Array(33).fill(null);

    // Helper to map and normalize
    const map = (cocoIdx: number, bpIdx: number) => {
        // MoveNet usually returns sorted keypoints matching COCO definition
        // We can access by index directly for speed, assuming standard MoveNet output
        const point = keypoints[cocoIdx];

        if (point) {
            landmarks[bpIdx] = {
                x: point.x / width,    // Normalize to 0-1
                y: point.y / height,   // Normalize to 0-1
                z: 0,                  // MoveNet is 2D
                visibility: point.score || 0
            };
        }
    };

    // Mapping COCO -> MediaPipe
    map(5, 11);  // L Shoulder
    map(6, 12);  // R Shoulder
    map(7, 13);  // L Elbow
    map(8, 14);  // R Elbow
    map(9, 15);  // L Wrist
    map(10, 16); // R Wrist
    map(11, 23); // L Hip
    map(12, 24); // R Hip
    map(0, 0);   // Nose (optional, for fun)

    return landmarks;
}
