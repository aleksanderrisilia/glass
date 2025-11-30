const wordService = require('../wordService');
const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

describe('WordService - Create, Access, and Read Word File', () => {
    let testWordFilePath;
    const testDir = path.join(__dirname, '../../../../test-temp');

    beforeAll(async () => {
        // Create test directory if it doesn't exist
        try {
            await fs.mkdir(testDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    });

    afterAll(async () => {
        // Clean up test files
        if (testWordFilePath) {
            try {
                await fs.unlink(testWordFilePath);
            } catch (error) {
                // File might not exist
            }
        }
        // Clean up test directory
        try {
            await fs.rmdir(testDir);
        } catch (error) {
            // Directory might not be empty or doesn't exist
        }
    });

    describe('Create Word Document', () => {
        it('should create a valid .docx file', async () => {
            testWordFilePath = path.join(testDir, 'test-document.docx');
            
            // Create a simple .docx file structure
            // DOCX files are ZIP archives containing XML files
            const zip = new AdmZip();
            
            // Create minimal document.xml with test content
            const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p>
            <w:r>
                <w:t>This is a test Word document.</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:r>
                <w:t>It contains multiple paragraphs.</w:t>
            </w:r>
        </w:p>
        <w:p>
            <w:r>
                <w:t>Testing text extraction functionality.</w:t>
            </w:r>
        </w:p>
    </w:body>
</w:document>`;
            
            // Add required files to the ZIP
            zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
            
            // Create minimal [Content_Types].xml
            const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
            zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf8'));
            
            // Create minimal _rels/.rels
            const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
            zip.addFile('_rels/.rels', Buffer.from(relsXml, 'utf8'));
            
            // Create minimal word/_rels/document.xml.rels
            const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
            zip.addFile('word/_rels/document.xml.rels', Buffer.from(wordRelsXml, 'utf8'));
            
            // Write the ZIP file as .docx
            zip.writeZip(testWordFilePath);
            
            // Verify file was created
            const stats = await fs.stat(testWordFilePath);
            expect(stats.isFile()).toBe(true);
            expect(stats.size).toBeGreaterThan(0);
            console.log(`[Test] Created Word document: ${testWordFilePath} (${stats.size} bytes)`);
        });
    });

    describe('Access Word Document', () => {
        it('should be able to access the created Word file', async () => {
            expect(testWordFilePath).toBeDefined();
            
            // Check file exists
            const exists = await fs.access(testWordFilePath).then(() => true).catch(() => false);
            expect(exists).toBe(true);
            
            // Verify it's a valid ZIP file (DOCX is a ZIP archive)
            const zip = new AdmZip(testWordFilePath);
            const entries = zip.getEntries();
            expect(entries.length).toBeGreaterThan(0);
            
            // Verify it contains the document.xml
            const documentEntry = entries.find(e => e.entryName === 'word/document.xml');
            expect(documentEntry).toBeDefined();
            console.log(`[Test] Successfully accessed Word document with ${entries.length} entries`);
        });

        it('should verify file extension is .docx', () => {
            const ext = path.extname(testWordFilePath).toLowerCase();
            expect(ext).toBe('.docx');
        });
    });

    describe('Read Word Document', () => {
        it('should extract text from the created Word document', async () => {
            const result = await wordService.extractTextFromWord(testWordFilePath);
            
            expect(result.success).toBe(true);
            expect(result.text).toBeDefined();
            expect(result.text.length).toBeGreaterThan(0);
            expect(result.method).toBe('text-extraction');
            
            // Verify extracted text contains expected content
            const extractedText = result.text.toLowerCase();
            expect(extractedText).toContain('test');
            expect(extractedText).toContain('word document');
            expect(extractedText).toContain('paragraphs');
            expect(extractedText).toContain('text extraction');
            
            console.log(`[Test] Extracted ${result.text.length} characters from Word document`);
            console.log(`[Test] Extracted text preview: ${result.text.substring(0, 100)}...`);
        });

        it('should handle progress callbacks during extraction', async () => {
            // Clear cache to ensure fresh extraction
            wordService.clearCache();
            
            const progressUpdates = [];
            const onProgress = (progress) => {
                progressUpdates.push(progress);
            };
            
            const result = await wordService.extractTextFromWord(testWordFilePath, {
                onProgress
            });
            
            expect(result.success).toBe(true);
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates[0]).toHaveProperty('status');
            expect(progressUpdates[0]).toHaveProperty('progress');
            expect(progressUpdates[0].status).toContain('Extracting');
        });

        it('should cache extracted content', async () => {
            // Clear cache first
            wordService.clearCache();
            
            // First extraction
            const result1 = await wordService.extractTextFromWord(testWordFilePath);
            expect(result1.success).toBe(true);
            
            // Second extraction should use cache
            const result2 = await wordService.extractTextFromWord(testWordFilePath);
            expect(result2.success).toBe(true);
            expect(result2.text).toBe(result1.text);
        });
    });

    describe('Error Handling', () => {
        it('should return error for non-existent file', async () => {
            const result = await wordService.extractTextFromWord('nonexistent.docx');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should return error for non-.docx files', async () => {
            // Create a test .txt file
            const txtFilePath = path.join(testDir, 'test.txt');
            await fs.writeFile(txtFilePath, 'This is a text file, not a Word document.');
            
            const result = await wordService.extractTextFromWord(txtFilePath);
            expect(result.success).toBe(false);
            expect(result.error).toContain('.docx');
            
            // Clean up
            await fs.unlink(txtFilePath);
        });
    });

    describe('Integration with ReadService', () => {
        it('should work with readService.readWord', async () => {
            const readService = require('../readService');
            
            // Mock session repository
            const sessionRepository = require('../../common/repositories/session');
            jest.spyOn(sessionRepository, 'getOrCreateActive').mockResolvedValue('test-session-123');
            
            // Mock read repository
            const readRepository = require('../repositories');
            jest.spyOn(readRepository, 'create').mockResolvedValue({
                id: 'read-123',
                session_id: 'test-session-123',
                url: `file://${testWordFilePath}`,
                title: 'test-document.docx',
                html_content: 'test content'
            });
            
            const result = await readService.readWord(testWordFilePath);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.title).toBe('test-document.docx');
            
            // Verify repository was called
            expect(readRepository.create).toHaveBeenCalled();
        });
    });
});

