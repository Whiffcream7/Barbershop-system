// Business rule #10: bawat protected page ay kailangan ng login
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Business rule #9: para sa admin-only pages
// Gamit: router.get('/', requireRole('admin'), ...)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send('Access denied. You do not have permission to view this page.');
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };