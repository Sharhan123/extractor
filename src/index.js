import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import "./index.css";
import App from "./App";

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8ab4f8',
      light: '#c2e7ff',
      dark: '#1967d2',
    },
    background: {
      default: '#1a1b1e',
      paper: '#202124',
    },
    text: {
      primary: '#e8eaed',
      secondary: '#9aa0a6',
    },
    divider: '#3c4043',
  },
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 500,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          padding: '8px 24px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
