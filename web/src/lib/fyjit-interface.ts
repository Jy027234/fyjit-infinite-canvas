export const FYJIT_INTERFACE_LANGUAGES = ["en", "zhCN", "fr", "ru", "ja", "vi", "zhTW"] as const;

export type FyjitInterfaceLanguage = (typeof FYJIT_INTERFACE_LANGUAGES)[number];

export const FYJIT_INTERFACE_LANGUAGE_OPTIONS: ReadonlyArray<{ code: FyjitInterfaceLanguage; label: string; short: string }> = [
    { code: "zhCN", label: "简体中文", short: "简中" },
    { code: "zhTW", label: "繁體中文", short: "繁中" },
    { code: "en", label: "English", short: "EN" },
    { code: "fr", label: "Français", short: "FR" },
    { code: "ru", label: "Русский", short: "RU" },
    { code: "ja", label: "日本語", short: "日本" },
    { code: "vi", label: "Tiếng Việt", short: "VI" },
];

const translations = {
    zhCN: {
        brand: "FYJIT 创作中心",
        brandHome: "FYJIT 创作中心首页",
        openNavigation: "打开导航菜单",
        navigation: "导航",
        backToFyjit: "返回 FYJIT",
        userMenu: "用户菜单",
        language: "语言",
        logout: "退出登录",
        loggingOut: "正在退出…",
        docs: "文档",
        lightTheme: "切换到浅色主题",
        darkTheme: "切换到深色主题",
        image: "生图工作台",
        video: "视频创作台",
        assets: "素材中心",
        prompts: "提示词库",
        canvas: "无限画布",
    },
    zhTW: {
        brand: "FYJIT 創作中心",
        brandHome: "FYJIT 創作中心首頁",
        openNavigation: "開啟導覽選單",
        navigation: "導覽",
        backToFyjit: "返回 FYJIT",
        userMenu: "使用者選單",
        language: "語言",
        logout: "登出",
        loggingOut: "正在登出…",
        docs: "文件",
        lightTheme: "切換至淺色主題",
        darkTheme: "切換至深色主題",
        image: "圖片工作台",
        video: "影片創作台",
        assets: "素材中心",
        prompts: "提示詞庫",
        canvas: "無限畫布",
    },
    en: {
        brand: "FYJIT Creative Center",
        brandHome: "FYJIT Creative Center home",
        openNavigation: "Open navigation",
        navigation: "Navigation",
        backToFyjit: "Back to FYJIT",
        userMenu: "User menu",
        language: "Language",
        logout: "Sign out",
        loggingOut: "Signing out…",
        docs: "Documentation",
        lightTheme: "Switch to light theme",
        darkTheme: "Switch to dark theme",
        image: "Image Workbench",
        video: "Video Workbench",
        assets: "Assets",
        prompts: "Prompt Library",
        canvas: "Infinite Canvas",
    },
    fr: {
        brand: "Centre créatif FYJIT",
        brandHome: "Accueil du centre créatif FYJIT",
        openNavigation: "Ouvrir la navigation",
        navigation: "Navigation",
        backToFyjit: "Retour à FYJIT",
        userMenu: "Menu utilisateur",
        language: "Langue",
        logout: "Se déconnecter",
        loggingOut: "Déconnexion…",
        docs: "Documentation",
        lightTheme: "Passer au thème clair",
        darkTheme: "Passer au thème sombre",
        image: "Atelier d’image",
        video: "Atelier vidéo",
        assets: "Ressources",
        prompts: "Bibliothèque de prompts",
        canvas: "Toile infinie",
    },
    ru: {
        brand: "Творческий центр FYJIT",
        brandHome: "Главная творческого центра FYJIT",
        openNavigation: "Открыть навигацию",
        navigation: "Навигация",
        backToFyjit: "Вернуться в FYJIT",
        userMenu: "Меню пользователя",
        language: "Язык",
        logout: "Выйти",
        loggingOut: "Выход…",
        docs: "Документация",
        lightTheme: "Включить светлую тему",
        darkTheme: "Включить тёмную тему",
        image: "Работа с изображениями",
        video: "Работа с видео",
        assets: "Материалы",
        prompts: "Библиотека промптов",
        canvas: "Бесконечный холст",
    },
    ja: {
        brand: "FYJIT クリエイティブセンター",
        brandHome: "FYJIT クリエイティブセンターのホーム",
        openNavigation: "ナビゲーションを開く",
        navigation: "ナビゲーション",
        backToFyjit: "FYJIT に戻る",
        userMenu: "ユーザーメニュー",
        language: "言語",
        logout: "ログアウト",
        loggingOut: "ログアウト中…",
        docs: "ドキュメント",
        lightTheme: "ライトテーマに切り替え",
        darkTheme: "ダークテーマに切り替え",
        image: "画像ワークベンチ",
        video: "動画ワークベンチ",
        assets: "素材センター",
        prompts: "プロンプトライブラリ",
        canvas: "無限キャンバス",
    },
    vi: {
        brand: "Trung tâm sáng tạo FYJIT",
        brandHome: "Trang chủ Trung tâm sáng tạo FYJIT",
        openNavigation: "Mở điều hướng",
        navigation: "Điều hướng",
        backToFyjit: "Quay lại FYJIT",
        userMenu: "Trình đơn người dùng",
        language: "Ngôn ngữ",
        logout: "Đăng xuất",
        loggingOut: "Đang đăng xuất…",
        docs: "Tài liệu",
        lightTheme: "Chuyển sang giao diện sáng",
        darkTheme: "Chuyển sang giao diện tối",
        image: "Bàn làm việc hình ảnh",
        video: "Bàn làm việc video",
        assets: "Tài nguyên",
        prompts: "Thư viện câu lệnh",
        canvas: "Canvas vô hạn",
    },
} satisfies Record<FyjitInterfaceLanguage, Record<string, string>>;

export type FyjitInterfaceKey = keyof (typeof translations)["zhCN"];

export function normalizeFyjitInterfaceLanguage(language?: string | null): FyjitInterfaceLanguage {
    const value = language?.trim();
    if (value === "zh" || value === "zh-CN" || value === "zh-Hans") return "zhCN";
    if (value === "zh-TW" || value === "zh-Hant") return "zhTW";
    return FYJIT_INTERFACE_LANGUAGES.includes(value as FyjitInterfaceLanguage) ? (value as FyjitInterfaceLanguage) : "zhCN";
}

export function resolveFyjitInterfaceLanguage(serverLanguage?: string): FyjitInterfaceLanguage {
    if (serverLanguage?.trim()) return normalizeFyjitInterfaceLanguage(serverLanguage);
    try {
        return normalizeFyjitInterfaceLanguage(window.localStorage.getItem("i18nextLng"));
    } catch {
        return "zhCN";
    }
}

export function translateFyjitInterface(language: FyjitInterfaceLanguage, key: FyjitInterfaceKey) {
    return translations[language][key] || translations.zhCN[key];
}

export function creativeNavigationLabel(language: FyjitInterfaceLanguage, key: string, fallback: string) {
    const labels: Record<string, FyjitInterfaceKey> = {
        "image-workbench": "image",
        "video-workbench": "video",
        "creative-assets": "assets",
        "creative-prompts": "prompts",
        "infinite-canvas": "canvas",
    };
    return labels[key] ? translateFyjitInterface(language, labels[key]) : fallback;
}
