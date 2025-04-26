export type Frontmatter = {
    externalRoot: string;
    internalRoot: string;
    relativePath: string;
    internalLink: string;
    externalLink: string;
    isUnlinked: boolean;
    syncType: string; // 실제 타입에 맞게 수정
    bidirectionalType: string; // 실제 타입에 맞게 수정
    deletedFileAction: string; // 실제 타입에 맞게 수정
    // 필요시 추가 필드
}