import { create } from "zustand";
import { persist } from "zustand/middleware";

type WorkbenchLayoutStore = {
    imageHistoryCollapsed: boolean;
    imageParametersCollapsed: boolean;
    videoHistoryCollapsed: boolean;
    videoParametersCollapsed: boolean;
    setImageHistoryCollapsed: (collapsed: boolean) => void;
    setImageParametersCollapsed: (collapsed: boolean) => void;
    setVideoHistoryCollapsed: (collapsed: boolean) => void;
    setVideoParametersCollapsed: (collapsed: boolean) => void;
};

export const useWorkbenchLayoutStore = create<WorkbenchLayoutStore>()(
    persist(
        (set) => ({
            imageHistoryCollapsed: false,
            imageParametersCollapsed: false,
            videoHistoryCollapsed: false,
            videoParametersCollapsed: false,
            setImageHistoryCollapsed: (imageHistoryCollapsed) => set({ imageHistoryCollapsed }),
            setImageParametersCollapsed: (imageParametersCollapsed) => set({ imageParametersCollapsed }),
            setVideoHistoryCollapsed: (videoHistoryCollapsed) => set({ videoHistoryCollapsed }),
            setVideoParametersCollapsed: (videoParametersCollapsed) => set({ videoParametersCollapsed }),
        }),
        { name: "fyjit-creative:workbench-layout" },
    ),
);
