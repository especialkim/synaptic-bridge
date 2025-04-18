/**
 * UUID 생성 유틸리티
 * v4 형식의 UUID를 생성하는 함수를 제공합니다.
 */

/**
 * v4 UUID를 생성합니다.
 * 외부 라이브러리 없이 간단한 구현을 제공합니다.
 * 
 * @returns 생성된 UUID 문자열
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
} 