import type { ComponentType } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { RouteErrorPage } from "@/components/layout/route-error-page";
import UserLayout from "@/layouts/user-layout";
const lazyPage = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter(
    [
        {
            element: (
                <UserLayout>
                    <AnalyticsTracker />
                    <Outlet />
                </UserLayout>
            ),
            errorElement: <RouteErrorPage />,
            children: [
                { path: "/", lazy: lazyPage(() => import("@/pages/image")) },
                { path: "/image", lazy: lazyPage(() => import("@/pages/image")) },
                { path: "/video", lazy: lazyPage(() => import("@/pages/video")) },
                { path: "/assets", lazy: lazyPage(() => import("@/pages/assets")) },
                { path: "/prompts", lazy: lazyPage(() => import("@/pages/prompts")) },
                { path: "/canvas", lazy: lazyPage(() => import("@/pages/canvas")) },
                { path: "/canvas/:id", lazy: lazyPage(() => import("@/pages/canvas/project")) },
            ],
        },
        { path: "*", lazy: lazyPage(() => import("@/pages/not-found")), errorElement: <RouteErrorPage /> },
    ],
    { basename: import.meta.env.BASE_URL },
);
