import { useCallback, useRef } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";

import { insertReferenceMention } from "@/lib/image-reference-prompt";

export function useReferenceMentionInsertion(value: string, onChange: (value: string) => void) {
    const textAreaRef = useRef<TextAreaRef>(null);
    const insertReference = useCallback(
        (label: string) => {
            const textArea = textAreaRef.current?.resizableTextArea?.textArea;
            const insertion = insertReferenceMention(value, label, textArea?.selectionStart, textArea?.selectionEnd);
            onChange(insertion.text);
            window.requestAnimationFrame(() => {
                const current = textAreaRef.current?.resizableTextArea?.textArea;
                current?.focus();
                current?.setSelectionRange(insertion.caret, insertion.caret);
            });
        },
        [onChange, value],
    );
    return { textAreaRef, insertReference };
}
