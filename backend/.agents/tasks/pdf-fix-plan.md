# Implementation Plan

## Problem Analysis
The current `extractPdfText` function in `backend/src/modules/cvModule/parseCvPdf/parseCvPdf.ts` uses a naive regex approach (`/\((?:\.|[^()\\])*\)/g`) that only extracts text wrapped in parentheses from PDF binary format. This fails for most real-world PDFs that use compressed streams, object streams, or different encodings. The endpoint returns garbled/gibberish text instead of actual PDF content.

The `pdf-parse` library (version 2.4.5) is already installed as a dependency and provides robust PDF text extraction for various PDF formats.

## Design Decisions
1. **Replace regex extraction with `pdf-parse`**: The `pdf-parse` library handles PDFs with compressed streams, object streams, and various encodings better than our custom regex solution.
2. **Maintain `toBuffer` compatibility**: The `toBuffer` function already handles multiple input types (Buffer, Uint8Array, Stream, etc.). We need to ensure `pdf-parse` works with Buffer inputs.
3. **Graceful error handling**: Some PDFs may be image-only, corrupted, or password-protected. We should handle these cases gracefully without crashing the entire endpoint.
4. **Preserve existing API contract**: The function must continue to return `{ key, text, charCount, cvProfile }` with the same structure.
5. **Update tests**: Current tests mock unrealistic PDF content. We need to update them to test realistic `pdf-parse` usage while maintaining test coverage.

## Implementation Steps

- [ ] 1. **Import `pdf-parse` and update `extractPdfText` function**
  - Add import: `import pdfParse from 'pdf-parse';` at the top of `parseCvPdf.ts`
  - Replace the entire `extractPdfText` function with a new implementation that:
    - Takes a Buffer as input (already handled by `toBuffer`)
    - Calls `pdfParse(pdfBytes)` with error handling
    - Extracts text from the result: `const data = await pdfParse(pdfBytes); const text = data.text;`
    - Handles empty text results by throwing `BadRequestError('Unable to extract text from PDF')`
    - Includes try-catch for `pdf-parse` specific errors (corrupted PDFs, etc.)
    - Returns cleaned text (trim whitespace, normalize line breaks)
  - Files: `backend/src/modules/cvModule/parseCvPdf/parseCvPdf.ts`
  - Verify: The TypeScript compiles without errors: `cd backend && npm run compile`

- [ ] 2. **Handle error cases and fallbacks**
  - Wrap the `pdfParse` call in try-catch block
  - Catch specific errors: corrupted PDFs, password-protected PDFs, image-only PDFs
  - Log specific error messages for debugging: `logger?.warn({ message: 'PDF parsing failed', error: err.message })`
  - Throw `BadRequestError` with descriptive message for client-facing errors
  - Ensure the function still fails gracefully if `pdf-parse` fails (throw appropriate error)
  - Files: `backend/src/modules/cvModule/parseCvPdf/parseCvPdf.ts`
  - Verify: Compilation succeeds and error handling logic is in place

- [ ] 3. **Update test mocks to use realistic PDF data**
  - Replace current test PDF mocks that use `BT /F1 12 Tf 72 720 Td (Hello world) Tj ET` format
  - Create realistic mock PDF data that `pdf-parse` can process:
    - Use actual text content wrapped in appropriate PDF markers
    - Include sample structured CV content for testing extraction
    - Ensure tests still validate character truncation (50,000 char limit)
  - Update the `B19` test to use realistic PDF content with structured CV data
  - Files: `backend/src/modules/cvModule/parseCvPdf/_tests/parseCvPdf.test.ts`
  - Verify: Tests pass: `cd backend && npm test -- parseCvPdf.test.ts`

- [ ] 4. **Test PDF parsing library integration**
  - Add a test case for successful PDF parsing with realistic content
  - Add test cases for error scenarios:
    - Empty PDF buffer
    - Corrupted PDF data
    - PDF parsing returning empty text
  - Verify character truncation still works (test with >50,000 character text)
  - Ensure the existing test coverage is maintained
  - Files: `backend/src/modules/cvModule/parseCvPdf/_tests/parseCvPdf.test.ts`
  - Verify: All tests pass: `cd backend && npm test -- parseCvPdf.test.ts`

- [ ] 5. **Update test for S3 GetObject response format**
  - Ensure the mock S3 response (`GetObjectCommand`) returns data in a format compatible with `toBuffer`
  - The current mock returns `{ Body: Buffer.from('...') }` which should work with `toBuffer`
  - Test that different body types (Buffer, Uint8Array, Stream) all work correctly
  - Files: `backend/src/modules/cvModule/parseCvPdf/_tests/parseCvPdf.test.ts`
  - Verify: Tests pass with different input formats

- [ ] 6. **Run full test suite and integration tests**
  - Run the full backend test suite to ensure no regressions
  - Specifically test the CV module integration: `cd backend && npm test -- --testPathPattern=cvModule`
  - Verify the `structureCvProfile` function still works with text extracted by `pdf-parse`
  - Files: `backend/` (run from root)
  - Verify: All CV module tests pass: `cd backend && npm test -- --testPathPattern=cvModule`

- [ ] 7. **Test with actual PDF file**
  - Optionally test with the provided test PDF: `C:\Users\dpman\Downloads\CV extended\AI first\Buhuti-Manakal-CV.pdf`
  - Create a simple test script to verify `pdf-parse` extracts text correctly from the actual PDF
  - This is optional verification, not required for the core fix
  - Files: Create test script if needed
  - Verify: PDF text extraction works on real PDF file

## Technical Details

### `pdf-parse` Integration
- `pdf-parse` returns a promise: `const data = await pdfParse(buffer);`
- The result contains `data.text` (extracted text), `data.numPages`, `data.info`, etc.
- We only need `data.text` for our use case
- The library handles various PDF formats including those with compressed streams

### Error Handling Strategy
1. **Corrupted PDFs**: `pdf-parse` will throw an error - catch and rethrow as `BadRequestError`
2. **Image-only PDFs**: `pdf-parse` may return empty or minimal text - check `text.length` and throw `BadRequestError` if empty
3. **Password-protected PDFs**: `pdf-parse` may fail - catch and throw descriptive error
4. **Large PDFs**: `pdf-parse` has its own memory limits - rely on AWS Lambda memory limits

### Performance Considerations
- `pdf-parse` is relatively fast for typical CV PDFs (1-10 pages)
- The 50,000 character truncation limit already protects against extremely large texts
- PDF parsing happens in memory - Lambda memory allocation (e.g., 512MB-1GB) should be sufficient

### Backward Compatibility
- API response structure remains unchanged: `{ key, text, charCount, cvProfile }`
- Error responses maintain same format using `BadRequestError`
- The `toBuffer` function remains unchanged
- All existing callers continue to work without modification

## Verification Commands
Each step should be verified using the project's actual build and test commands:

1. `cd backend && npm run compile` - TypeScript compilation
2. `cd backend && npm test -- parseCvPdf.test.ts` - Specific test file
3. `cd backend && npm test -- --testPathPattern=cvModule` - All CV module tests
4. `cd backend && npm test` - Full test suite

## Risk Mitigation
- **Risk**: `pdf-parse` may fail on certain PDF formats that our regex approach could handle
  - **Mitigation**: The regex approach only worked on trivial PDFs. Real-world CV PDFs already fail with current implementation, so this is an improvement.
- **Risk**: Performance degradation with large PDFs
  - **Mitigation**: The 50,000 character truncation already limits text size. Lambda cold starts may be slightly longer but acceptable.
- **Risk**: New dependency issues
  - **Mitigation**: `pdf-parse` is already in `package.json`. We're just using an existing dependency.