import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { useMemo } from "react";

import { fetchCreativeProjects } from "@/services/api/creative";

export function ProjectPicker({ value, onChange, className }: { value?: string; onChange: (value: string) => void; className?: string }) {
    const projectsQuery = useQuery({
        queryKey: ["creative-projects"],
        queryFn: ({ signal }) => fetchCreativeProjects({ pageSize: 100, signal }),
        staleTime: 60_000,
    });
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
