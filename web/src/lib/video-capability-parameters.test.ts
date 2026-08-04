import { describe, expect, test } from "bun:test";

import { defaultConfig } from "@/stores/use-config-store";
import { buildVideoCapabilityParameters, unsupportedVideoControls } from "@/lib/video-capability-parameters";

describe("video capability parameters", () => {
    test("sends only controls declared by the server profile", () => {
        const config = {
            ...defaultConfig,
            videoSeconds: "8",
            size: "9:16",
            vquality: "1080p",
            videoFps: "24",
            videoGenerateAudio: "true",
            videoWatermark: "false",
            videoCameraFixed: "true",
        };
        expect(buildVideoCapabilityParameters(config, ["duration", "size", "resolution", "generate_audio", "camera_fixed"])).toEqual({
            count: 1,
            duration: 8,
            size: "9:16",
            resolution: "1080p",
            generate_audio: true,
            camera_fixed: true,
        });
    });

    test("describes controls fixed by the selected model", () => {
        expect(unsupportedVideoControls(["duration", "size", "resolution"])).toEqual(["帧率", "声音", "水印", "镜头固定"]);
    });
});
