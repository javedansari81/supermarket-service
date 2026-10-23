/**
 * Header Component
 */
import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Menu,
  MenuItem,
  Avatar,
  Divider,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import {
  Check,
  DarkMode,
  LightMode,
  Logout,
  Menu as MenuIcon,
  Person,
  SettingsBrightness,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

type ThemeMode = 'light' | 'dark' | 'system';

const themeModes: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <LightMode fontSize="small" /> },
  { value: 'dark', label: 'Dark', icon: <DarkMode fontSize="small" /> },
  { value: 'system', label: 'System', icon: <SettingsBrightness fontSize="small" /> },
];

interface HeaderProps {
  pageHeaderSlotRef: (el: HTMLElement | null) => void;
  drawerWidth: number;
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ pageHeaderSlotRef, drawerWidth, onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [themeAnchorEl, setThemeAnchorEl] = React.useState<null | HTMLElement>(null);
  const { mode, setMode } = useColorScheme();
  const currentMode = themeModes.find((m) => m.value === (mode ?? 'light')) ?? themeModes[0];

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate('/login');
  };

  return (
    <AppBar
      position="fixed"
      color="inherit"
      sx={{
        width: `calc(100% - ${drawerWidth}px)`,
        ml: `${drawerWidth}px`,
        transition: (theme) => theme.transitions.create(['width', 'margin']),
        backgroundColor: 'background.paper',
        backgroundImage: 'none',
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
        {onMenuClick && (
          <IconButton
            onClick={onMenuClick}
            edge="start"
            aria-label="Open menu"
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Box ref={pageHeaderSlotRef} sx={{ flexGrow: 1, minWidth: 0, mr: { xs: 1, sm: 2 } }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexShrink: 0 }}>
          <Tooltip title={`Theme: ${currentMode.label}`}>
            <IconButton
              onClick={(e) => setThemeAnchorEl(e.currentTarget)}
              size="small"
              aria-label="Change theme"
            >
              {currentMode.icon}
            </IconButton>
          </Tooltip>

          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" fontWeight="bold">
              {user?.full_name || user?.username}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.role === 'admin' ? 'Administrator' : user?.role === 'supervisor' ? 'Supervisor' : 'Cashier'}
            </Typography>
          </Box>
          
          <IconButton onClick={handleMenuOpen} size="small">
            <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
              {user?.username?.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
        </Box>

        <Menu
          anchorEl={themeAnchorEl}
          open={Boolean(themeAnchorEl)}
          onClose={() => setThemeAnchorEl(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {themeModes.map((m) => (
            <MenuItem
              key={m.value}
              selected={m.value === currentMode.value}
              onClick={() => {
                setMode(m.value);
                setThemeAnchorEl(null);
              }}
            >
              <ListItemIcon>{m.icon}</ListItemIcon>
              <ListItemText>{m.label}</ListItemText>
              {m.value === currentMode.value && <Check fontSize="small" sx={{ ml: 2 }} />}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          onClick={handleMenuClose}
          PaperProps={{
            sx: { minWidth: 180 },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem disabled>
            <ListItemIcon>
              <Person fontSize="small" />
            </ListItemIcon>
            {user?.username}
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleLogout}>
            <ListItemIcon>
              <Logout fontSize="small" />
            </ListItemIcon>
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Header;

