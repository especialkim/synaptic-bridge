export enum AddFileType {
    /* Not Markdown */
    SYSTEM_ADD_FILE = 'system_add_file',                 // markdown 외 파일, 시스템 생성
    USER_ADD_FILE = 'user_add_file',                     // markdown 외 파일, 사용자가 새로 만든 경우
    
    /* Markdown */
    SYSTEM_ADD_MD_BLANK = 'system_add_md_blank',         // 거의 발생하지 않음
    SYSTEM_ADD_MD_CONTENT = 'system_add_md_content',     // 동기화/복사/재생성
    USER_ADD_MD_BLANK = 'user_add_md_blank',             // 사용자가 빈 마크다운 생성
    USER_ADD_MD_CONTENT = 'user_add_md_content',         // 사용자가 이동하거나 복사한 .md
}

export enum ChangeFileType {
    USER_CHANGE_NOT_MD = 'user_change_not_md',
    SYSTEM_CHANGE_NOT_MD = 'system_change_not_md',
    USER_CHANGE_MD = 'user_change_md',
    SYSTEM_CHANGE_MD = 'system_change_md',
}

export type SyncEvent = {
    createdAt: number;
    modifiedAt: number;
    renamedAt: number;
    deletedAt: number;
}

export type SyncInternalManagerState = {
    [path: string]: SyncEvent;
}

export enum DeleteFileType {
    USER_DELETE_MD = 'user_delete_md',
    USER_DELETE_NOT_MD = 'user_delete_not_md',
    SYSTEM_DELETE_MD = 'system_delete_md',  
    SYSTEM_DELETE_NOT_MD = 'system_delete_not_md',  
}

export enum DeleteFolderType {
    USER_DELETE_FOLDER = 'user_delete_folder',
    SYSTEM_DELETE_FOLDER = 'system_delete_folder',
}