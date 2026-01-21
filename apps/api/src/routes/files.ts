import { Router, Request, Response } from 'express';
import { storageService } from '../services/storage.service';

const router = Router();

/**
 * GET /files/:container/:routineId/:filename
 * Serve files from mock storage (development only)
 */
router.get('/:container/:routineId/:filename', (req: Request, res: Response) => {
  const { container, routineId, filename } = req.params;
  const blobName = `${routineId}/${filename}`;

  // Type guard for getBlob method (only available in mock storage)
  if (!storageService.getBlob) {
    return res.status(404).json({ error: 'File serving not available in production' });
  }

  const buffer = storageService.getBlob(container, blobName);

  if (!buffer) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set content type based on container/extension
  if (container === 'pdfs' || filename.endsWith('.pdf')) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  } else if (container === 'photos' || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (filename.endsWith('.png')) {
    res.setHeader('Content-Type', 'image/png');
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
  }

  res.send(buffer);
});

export default router;
