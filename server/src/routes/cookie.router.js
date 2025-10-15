// src/routes/cookieRoutes.js
import express from 'express';
import CookieController from '../controllers/cookie.controller.js';

const cookieRouter = express.Router();

// Import cookies manually
cookieRouter.post('/import', CookieController.importCookies);

// Bulk import cookies
cookieRouter.post('/bulk-import', CookieController.bulkImportCookies);

// Get cookie status for specific user
cookieRouter.get('/status/:email', CookieController.getCookieStatus);

// Get all users with valid cookies
cookieRouter.get('/users', CookieController.getAllCookieUsers);

// Test cookies for specific user
cookieRouter.get('/test/:email', CookieController.testCookies);

// Delete cookies for specific user
cookieRouter.delete('/:email', CookieController.deleteCookies);

// Invalidate cookies (mark as invalid)
cookieRouter.patch('/invalidate/:email', CookieController.invalidateCookies);

// Cleanup expired cookies
cookieRouter.delete('/cleanup/expired', CookieController.cleanupExpired);

export default cookieRouter;