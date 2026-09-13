import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { useMemo } from "react";

import { creativeProjectListQueryOptions } from "@/services/creative-asset-list";

export function ProjectPicker({ value, onChange, className }: { value?: string; onChange: (value: string) => void; className?: string }) {
    const projectsQuery = useQuery(creativeProjectListQueryOptions({ pageSize: 100 }));
    const projects = projectsQuery.data?.items;
    const options = useMemo(() => (projects || []).map((project) => ({ label: project.title, value: project.project_id })), [projects]);

    return (
        <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={value || undefined}
            placeholder="不归入项目"
            loading={projectsQuery.isLoading}
            status={projectsQuery.isError ? "error" : undefined}
            options={options}
            className={className}
            onChange={(next) => onChange(next || "")}
        />
    );
}
