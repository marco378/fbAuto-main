// src/controllers/cookieController.js

import CookieService from "../services/cookie.service.js";

export class CookieController {
  // Import cookies manually (from browser export)
  static async importCookies(req, res) {
    try {
      const { email, cookies, metadata } = req.body;

      if (!email || !cookies) {
        return res.status(400).json({
          success: false,
          message: 'Email and cookies are required'
        });
      }

      // Validate cookies format
      if (!Array.isArray(cookies)) {
        return res.status(400).json({
          success: false,
          message: 'Cookies must be an array'
        });
      }

      // Save cookies
      await CookieService.saveCookies(email, cookies, metadata);

      res.status(200).json({
        success: true,
        message: `Successfully imported ${cookies.length} cookies for ${email}`,
        data: {
          email,
          cookieCount: cookies.length,
          importedAt: new Date()
        }
      });
    } catch (error) {
      console.error('❌ Cookie import error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to import cookies',
        error: error.message
      });
    }
  }

  // Get cookie status for user
  static async getCookieStatus(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const validation = await CookieService.validateCookies(email);

      res.status(200).json({
        success: true,
        data: {
          email,
          valid: validation.valid,
          reason: validation.reason,
          lastUsed: validation.lastUsed,
          expiresAt: validation.expiresAt
        }
      });
    } catch (error) {
      console.error('❌ Cookie status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get cookie status',
        error: error.message
      });
    }
  }

  // Get all users with cookies
  static async getAllCookieUsers(req, res) {
    try {
      const users = await CookieService.getUsersWithValidCookies();

      res.status(200).json({
        success: true,
        data: {
          users,
          count: users.length
        }
      });
    } catch (error) {
      console.error('❌ Get all cookie users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get cookie users',
        error: error.message
      });
    }
  }

  // Delete cookies for user
  static async deleteCookies(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      await CookieService.deleteCookies(email);

      res.status(200).json({
        success: true,
        message: `Successfully deleted cookies for ${email}`
      });
    } catch (error) {
      console.error('❌ Cookie deletion error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete cookies',
        error: error.message
      });
    }
  }

  // Invalidate cookies (mark as invalid)
  static async invalidateCookies(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      await CookieService.invalidateCookies(email);

      res.status(200).json({
        success: true,
        message: `Successfully invalidated cookies for ${email}`
      });
    } catch (error) {
      console.error('❌ Cookie invalidation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to invalidate cookies',
        error: error.message
      });
    }
  }

  // Cleanup expired cookies
  static async cleanupExpired(req, res) {
    try {
      const deletedCount = await CookieService.cleanupExpiredCookies();

      res.status(200).json({
        success: true,
        message: `Successfully cleaned up ${deletedCount} expired cookie records`,
        data: { deletedCount }
      });
    } catch (error) {
      console.error('❌ Cookie cleanup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup expired cookies',
        error: error.message
      });
    }
  }

  // Test cookies by attempting login
  static async testCookies(req, res) {
    try {
      const { email } = req.params;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // This would trigger a test automation run
      // You can integrate with your existing automation here
      const validation = await CookieService.validateCookies(email);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Cannot test cookies: ${validation.reason}`
        });
      }

      // Here you could run a quick automation test
      // For now, we'll just return the validation status
      res.status(200).json({
        success: true,
        message: 'Cookies are valid and ready for testing',
        data: {
          email,
          cookiesValid: true,
          lastUsed: validation.lastUsed,
          expiresAt: validation.expiresAt
        }
      });
    } catch (error) {
      console.error('❌ Cookie test error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test cookies',
        error: error.message
      });
    }
  }

  // Bulk import cookies for multiple users
  static async bulkImportCookies(req, res) {
    try {
      const { imports } = req.body;

      if (!Array.isArray(imports)) {
        return res.status(400).json({
          success: false,
          message: 'Imports must be an array of {email, cookies, metadata} objects'
        });
      }

      const results = [];

      for (const importData of imports) {
        try {
          const { email, cookies, metadata } = importData;
          await CookieService.saveCookies(email, cookies, metadata);
          results.push({
            email,
            success: true,
            cookieCount: cookies.length
          });
        } catch (error) {
          results.push({
            email: importData.email,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.status(200).json({
        success: true,
        message: `Bulk import completed: ${successCount}/${imports.length} successful`,
        data: { results }
      });
    } catch (error) {
      console.error('❌ Bulk import error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk import cookies',
        error: error.message
      });
    }
  }
}

export default CookieController;