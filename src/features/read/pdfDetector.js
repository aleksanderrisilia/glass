const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

/**
 * Detects currently open PDF files on Windows
 * Uses Windows API to find PDF viewer windows and extract file paths
 */
class PDFDetector {
    constructor() {
        this.cachedOpenPDF = null;
        this.cacheTimestamp = null;
        this.cacheTTL = 5000; // 5 seconds cache
    }

    /**
     * Get the currently open PDF file path on Windows
     * @returns {Promise<string|null>} Path to open PDF or null if not found
     */
    async getCurrentlyOpenPDF() {
        // Check cache first
        if (this.cachedOpenPDF && this.cacheTimestamp) {
            const age = Date.now() - this.cacheTimestamp;
            if (age < this.cacheTTL) {
                // Verify file still exists
                try {
                    await fs.access(this.cachedOpenPDF);
                    return this.cachedOpenPDF;
                } catch {
                    // File no longer exists, clear cache
                    this.cachedOpenPDF = null;
                    this.cacheTimestamp = null;
                }
            }
        }

        if (process.platform !== 'win32') {
            console.log('[PDFDetector] Not Windows, skipping PDF detection');
            return null;
        }

        try {
            // Method 1: Check active window title for PDF viewers
            const activePDF = await this.getPDFFromActiveWindow();
            if (activePDF) {
                this.cachedOpenPDF = activePDF;
                this.cacheTimestamp = Date.now();
                return activePDF;
            }

            // Method 2: Check file handles for common PDF viewers
            const handlePDF = await this.getPDFFromFileHandles();
            if (handlePDF) {
                this.cachedOpenPDF = handlePDF;
                this.cacheTimestamp = Date.now();
                return handlePDF;
            }

            // Method 3: Check recent files in common PDF viewer locations
            const recentPDF = await this.getPDFFromRecentFiles();
            if (recentPDF) {
                this.cachedOpenPDF = recentPDF;
                this.cacheTimestamp = Date.now();
                return recentPDF;
            }

            return null;
        } catch (error) {
            console.error('[PDFDetector] Error detecting PDF:', error);
            return null;
        }
    }

    /**
     * Get PDF from active window title (works for Adobe, Edge, Chrome PDF viewer)
     */
    async getPDFFromActiveWindow() {
        try {
            // PowerShell script to get active window title
            const psScript = `
                Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    public class Win32 {
                        [DllImport("user32.dll")]
                        public static extern IntPtr GetForegroundWindow();
                        [DllImport("user32.dll", CharSet=CharSet.Auto)]
                        public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
                    }
"@
                $hwnd = [Win32]::GetForegroundWindow()
                $title = New-Object System.Text.StringBuilder 256
                [Win32]::GetWindowText($hwnd, $title, 256)
                $title.ToString()
            `;

            const { stdout } = await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`);
            const windowTitle = stdout.trim();

            if (!windowTitle) return null;

            // Check if title contains PDF indicators
            const pdfIndicators = ['.pdf', 'Adobe', 'PDF', 'Acrobat'];
            const hasPDFIndicator = pdfIndicators.some(indicator => 
                windowTitle.toLowerCase().includes(indicator.toLowerCase())
            );

            if (!hasPDFIndicator) return null;

            // Extract file path from title (format: "filename.pdf - Adobe Acrobat" or "filename.pdf - Edge")
            const pdfMatch = windowTitle.match(/([A-Z]:[^\\]+\.pdf)/i);
            if (pdfMatch) {
                const filePath = pdfMatch[1];
                try {
                    await fs.access(filePath);
                    return filePath;
                } catch {
                    // Try to find file in common locations
                    const fileName = path.basename(filePath);
                    return await this.findPDFFile(fileName);
                }
            }

            // Try extracting just filename
            const filenameMatch = windowTitle.match(/([^\\/]+\.pdf)/i);
            if (filenameMatch) {
                const fileName = filenameMatch[1];
                return await this.findPDFFile(fileName);
            }

            return null;
        } catch (error) {
            console.error('[PDFDetector] Error getting active window:', error);
            return null;
        }
    }

    /**
     * Get PDF from file handles (check what files are open by PDF processes)
     */
    async getPDFFromFileHandles() {
        try {
            // Use handle.exe or PowerShell to check open files
            // This is a simplified version - in production, you might want to use handle.exe
            const psScript = `
                Get-Process | Where-Object {
                    $_.ProcessName -match 'AcroRd32|Acrobat|SumatraPDF|FoxitReader|PDFXEdit|Edge|Chrome'
                } | ForEach-Object {
                    $_.MainWindowTitle
                } | Select-Object -First 1
            `;

            const { stdout } = await execAsync(`powershell -Command "${psScript}"`);
            const title = stdout.trim();

            if (title) {
                const pdfMatch = title.match(/([A-Z]:[^\\]+\.pdf)/i);
                if (pdfMatch) {
                    const filePath = pdfMatch[1];
                    try {
                        await fs.access(filePath);
                        return filePath;
                    } catch {
                        return null;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('[PDFDetector] Error checking file handles:', error);
            return null;
        }
    }

    /**
     * Get PDF from recent files in common PDF viewer locations
     */
    async getPDFFromRecentFiles() {
        try {
            // Check Windows Recent files
            const recentPath = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
            try {
                const files = await fs.readdir(recentPath);
                const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
                
                if (pdfFiles.length > 0) {
                    // Get most recently modified
                    const fileStats = await Promise.all(
                        pdfFiles.map(async (file) => {
                            try {
                                const fullPath = path.join(recentPath, file);
                                const stats = await fs.stat(fullPath);
                                return { path: fullPath, mtime: stats.mtime };
                            } catch {
                                return null;
                            }
                        })
                    );

                    const validFiles = fileStats.filter(f => f !== null);
                    if (validFiles.length > 0) {
                        validFiles.sort((a, b) => b.mtime - a.mtime);
                        // Try to resolve the actual file path from shortcut
                        const recentFile = validFiles[0].path;
                        return await this.resolveShortcut(recentFile);
                    }
                }
            } catch {
                // Recent folder not accessible
            }

            return null;
        } catch (error) {
            console.error('[PDFDetector] Error checking recent files:', error);
            return null;
        }
    }

    /**
     * Resolve Windows shortcut (.lnk) to actual file path
     */
    async resolveShortcut(shortcutPath) {
        try {
            const psScript = `
                $shell = New-Object -ComObject WScript.Shell
                $shortcut = $shell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
                $shortcut.TargetPath
            `;

            const { stdout } = await execAsync(`powershell -Command "${psScript}"`);
            const targetPath = stdout.trim();

            if (targetPath && targetPath.toLowerCase().endsWith('.pdf')) {
                try {
                    await fs.access(targetPath);
                    return targetPath;
                } catch {
                    return null;
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Find PDF file by name in common locations
     */
    async findPDFFile(fileName) {
        const searchPaths = [
            process.env.USERPROFILE + '\\Documents',
            process.env.USERPROFILE + '\\Downloads',
            process.env.USERPROFILE + '\\Desktop',
        ];

        for (const searchPath of searchPaths) {
            try {
                const filePath = path.join(searchPath, fileName);
                await fs.access(filePath);
                return filePath;
            } catch {
                // File not found in this location, continue
            }
        }

        return null;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cachedOpenPDF = null;
        this.cacheTimestamp = null;
    }
}

module.exports = new PDFDetector();

