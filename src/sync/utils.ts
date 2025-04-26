import matter from 'gray-matter';
import * as fs from 'fs';
import { App, FileSystemAdapter } from 'obsidian';

export async function fsReadFrontmatter(filePath: string): Promise<matter.GrayMatterFile<string>> {
    const content = await fsReadFile(filePath);
    const frontmatter = matter(content);
    return frontmatter;
}

// export async function fsUpdateFrontmatter(filePath: string, frontmatter: Record<string, any>): Promise<void> {
//     const raw = await fsReadFile(filePath);
//     const { data, content } = matter(raw);
  
//     const merged = { ...data, ...frontmatter };
//     const updatedContent = matter.stringify(content, merged);
  
//     await fs.promises.writeFile(filePath, updatedContent, 'utf8');
// }

export async function fsReadFile(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content;
}

export async function fsWriteFileAsync(filePath: string, raw: string): Promise<void> {
    try {
        await fs.promises.writeFile(filePath, raw, 'utf8');
    } catch (err) {
        console.error(`[File] 비동기 쓰기 실패: ${filePath}`, err);
        throw err;
    }
}

export function getVaultName(app: App): string {
    const basePath = (app.vault.adapter as FileSystemAdapter).getBasePath?.();
    if (!basePath) return "Obsidian";
    
    // 경로에서 마지막 폴더 이름을 Vault 이름으로 사용
    const pathParts = basePath.split(/[/\\]/);
    const vaultName = pathParts[pathParts.length - 1] || "Obsidian";
    return encodeURIComponent(vaultName);
}
