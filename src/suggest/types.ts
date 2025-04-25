import SynapticRoute from "main";

export interface SuggestProps {
    inputEl: HTMLInputElement;
    plugin: SynapticRoute;
}

export interface SuggestMatch {
    path: string;
    score: number;
}