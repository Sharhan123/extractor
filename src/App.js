import React, { useState, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  AppBar,
  Toolbar,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import CloseIcon from "@mui/icons-material/Close";
import "./App.css";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI("AIzaSyBQruR2g3VXhlHFFqZpPXW8HONYsAhw47Y");

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

// Utility function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Enhanced Gemini API call with retry logic
const callGeminiWithRetry = async (model, prompt, imageData) => {
  let retryCount = 0;
  let lastError = null;

  while (retryCount < RETRY_CONFIG.maxRetries) {
    try {
      return await model.generateContent([prompt, imageData]);
    } catch (error) {
      lastError = error;

      // Check if error is retryable (503 or rate limit)
      if (error.status === 503 || error.message?.includes("rate limit")) {
        retryCount++;
        if (retryCount < RETRY_CONFIG.maxRetries) {
          // Calculate delay with exponential backoff
          const backoffDelay = Math.min(
            RETRY_CONFIG.initialDelay * Math.pow(2, retryCount - 1),
            RETRY_CONFIG.maxDelay
          );
          console.log(
            `Attempt ${retryCount} failed. Retrying in ${backoffDelay}ms...`
          );
          await delay(backoffDelay);
          continue;
        }
      } else {
        // Non-retryable error
        throw error;
      }
    }
  }

  // If we've exhausted all retries
  throw new Error(
    `Failed after ${RETRY_CONFIG.maxRetries} attempts. Last error: ${lastError.message}`
  );
};

// Utility function to convert File to GenerativePart
const fileToGenerativePart = async (file) => {
  const base64EncodedImage = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: base64EncodedImage,
      mimeType: file.type,
    },
  };
};

// Toast component
const Toast = ({ message, type, onClose }) => (
  <div className={`toast toast-${type}`}>
    {type === "success" ? "✓" : "⚠"} {message}
    <button onClick={onClose} className="toast-close">
      ×
    </button>
  </div>
);

// Modal component
const Modal = ({ children, onClose }) => (
  <div className="modal-overlay">
    <div className="modal-content">
      <button className="modal-close" onClick={onClose}>
        ×
      </button>
      {children}
    </div>
  </div>
);

const VisuallyHiddenInput = styled("input")`
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  bottom: 0;
  left: 0;
  white-space: nowrap;
  width: 1px;
`;

const DropZone = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  textAlign: "center",
  cursor: "pointer",
  border: `2px dashed ${theme.palette.divider}`,
  "&:hover": {
    borderColor: theme.palette.primary.main,
    backgroundColor: theme.palette.action.hover,
  },
  minHeight: 200,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: theme.spacing(2),
}));

function App() {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [processedForms, setProcessedForms] = useState(new Set());

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImage(file);
      setFormData(null); // Reset form data when new image is uploaded
    }
  };

  const generateFormFillingScript = (data) => {
    // First, add the utility functions
    let script = `// Enable pasting in all input fields
document.querySelectorAll("input, textarea").forEach(el => {
    el.removeAttribute("onpaste");
    el.removeAttribute("oncopy");
    el.removeAttribute("oncut");
});

// Utility function to type text into input fields
function typeInput(selector, text) {
    let input = document.querySelector(selector);
    if (!input) {
        console.log('Input not found:', selector);
        return;
    }
    input.focus();
    let event = new InputEvent('input', { bubbles: true });
    input.value = text; // Set value directly first
    input.dispatchEvent(event);
    // Also trigger change event
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Start filling the form
console.log("Starting form fill...");
`;

    // Map the extracted data fields to form input selectors
    const fieldMappings = {
      FormNumber: 'input[name="FormNumber"], input[id="FormNumber"]',
      FormNumberId: 'input[name="FormNumberId"], input[id="FormNumberId"]',
      CompanyName: 'input[name="CompanyName"], input[id="CompanyName"]',
      YearlyRevenue: 'input[name="YearlyRevenue"], input[id="YearlyRevenue"]',
      Website: 'input[name="Website"], input[id="Website"]',
      EmailId:
        'input[name="EmailId"], input[id="EmailId"], input[type="email"]',
      Country:
        'input[name="Country"], select[name="Country"], input[id="Country"], select[id="Country"]',
      HeadQuarter: 'input[name="HeadQuarter"], input[id="HeadQuarter"]',
      Industry:
        'input[name="Industry"], select[name="Industry"], input[id="Industry"], select[id="Industry"]',
      Product: 'input[name="Product"], input[id="Product"]',
      RegistrationDate:
        'input[name="RegistrationDate"], input[id="RegistrationDate"], input[type="date"]',
      NumEmployees: 'input[name="NumEmployees"], input[id="NumEmployees"]',
      CompanyAddress:
        'input[name="CompanyAddress"], textarea[name="CompanyAddress"], input[id="CompanyAddress"], textarea[id="CompanyAddress"]',
      WorkSample:
        'input[name="WorkSample"], input[id="WorkSample"], input[type="file"]',
      DataNumber: 'input[name="DataNumber"], input[id="DataNumber"]',
      ZipCode: 'input[name="ZipCode"], input[id="ZipCode"]',
      BrandAmbassador:
        'input[name="BrandAmbassador"], input[id="BrandAmbassador"]',
      MediaPartner: 'input[name="MediaPartner"], input[id="MediaPartner"]',
      SocialMedia: 'input[name="SocialMedia"], input[id="SocialMedia"]',
      FranchisePartner:
        'input[name="FranchisePartner"], input[id="FranchisePartner"]',
      AdvertisingPartner:
        'input[name="AdvertisingPartner"], input[id="AdvertisingPartner"]',
      Investor: 'input[name="Investor"], input[id="Investor"]',
      AccAudit: 'input[name="AccAudit"], input[id="AccAudit"]',
      Services:
        'input[name="Services"], select[name="Services"], input[id="Services"], select[id="Services"]',
      Landmark:
        'input[name="Landmark"], textarea[name="Landmark"], input[id="Landmark"], textarea[id="Landmark"]',
      Currency:
        'input[name="Currency"], select[name="Currency"], input[id="Currency"], select[id="Currency"]',
      YearlyExpense: 'input[name="YearlyExpense"], input[id="YearlyExpense"]',
      Filename:
        'input[name="Filename"], input[id="Filename"], input[type="file"]',
      Manager: 'input[name="Manager"], input[id="Manager"]',
      SubClassification:
        'input[name="SubClassification"], input[id="SubClassification"]',
      Fax: 'input[name="Fax"], input[id="Fax"]',
      CompanyCode: 'input[name="CompanyCode"], input[id="CompanyCode"]',
      State:
        'input[name="State"], select[name="State"], input[id="State"], select[id="State"]',
      ContactNumber: 'input[name="ContactNumber"], input[id="ContactNumber"]',
    };

    Object.entries(data).forEach(([field, value]) => {
      const selector = fieldMappings[field];

      // If no selector found, skip the field
      if (!selector) {
        console.log(`No selector found for field: ${field}`);
        return;
      }

      // Replace N/A with "Data Not Available" while preserving any tags
      const finalValue = value
        ? value.replace(
            /(<[^>]+>)?N\/A(<[^>]+>)?/gi,
            (match, beforeTag, afterTag) => {
              return `${beforeTag || ""}Data Not Available${afterTag || ""}`;
            }
          )
        : "Data Not Available";

      // Add the command to fill this field
      script += `\ntypeInput('${selector}', '${finalValue.replace(
        /'/g,
        "\\'"
      )}')`;
    });

    script += '\nconsole.log("Form filling complete!");';
    return script;
  };

  const abbreviations = {
    LTD: "Limited",
    LLC: "Limited Liability Company",
    INC: "Incorporation",
    PTE: "Private Limited",
    CO: "Company",
    CORP: "Corporation",
    UAE: "United Arab Emirates",
    USA: "United States Of America",
    KSA: "Kingdom of Saudi Arabia",
    UK: "United Kingdom",
    "&": "AND",
    AUD: "Australian Dollar",
    BMD: "Bermuda Dollar",
    PVT: "Private",
    CAD: "Canadian Dollar",
    CD: "Canadian Dollar",
    EUA: "Employees Union Association",
    CHF: "Confederazione Helvetica Swiss Franc",
    EUR: "Euro",
    LLP: "Limited Liability Partnership",
    GB: "Great Britain",
    HK: "Hong Kong",
    GBP: "Great Britain Pound",
    NIS: "New Israel Shekel",
    INR: "Indian Rupees",
    PRC: "Peoples Republic Of China",
    NZD: "Newzeland Dollar",
    RMB: "Ren Min Bi",
    SAR: "South African Rand",
    TD: "Taiwanese Dollar",
    USD: "United States Dollar",
    AED: "Arab Emirates Dirham",
    MYR: "Malaysia Ringgit",
    SGD: "Singapore Dollar",
    CNY: "Chinese Yuan",
    "SDN BHD": "Sendrian Berhad",
    US: "United States",
    JPY: "Japanese Yan",
    IND: "India",
    DEU: "Germany",
    HKD: "Hong Kong Dollar",
    PLC: "Public Limited Company",
    JPN: "Japan",
    THB: "Thai Baht",
    BK: "Bangkok",
  };

  const tagRules = {
    FormNumber: (value) => `<B>${value}<B>`,
    CompanyName: (value) => `<R>${value}<R>`,
    Website: (value) => `<I><U>${value}`,
    Product: (value) => `<R><B>${value}`,
    HeadQuarter: (value) => `<I><U>${value}<U><I>`,
    Country: (value) => `<R><I>${value}<I><R>`,
    Industry: (value) => `<B><U>${value}<U><B>`,
    BrandAmbassador: (value) => `<B>${value}<B>`,
    Manager: (value) => `<B>${value}<B>`,
    SubClassification: (value) => `<I><U>${value}<U><I>`,
  };

  const formatDate = (dateStr) => {
    try {
      const [day, month, year] = dateStr.split(/[/-]/);
      const date = new Date(year, month - 1, day);
      const suffix = ["th", "st", "nd", "rd"][
        (day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10
      ];
      return `${day}${suffix} ${date.toLocaleString("en-US", {
        month: "long",
      })} ${year}`;
    } catch {
      return dateStr;
    }
  };

  const capitalizeWords = (str) => {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const expandAbbreviations = (text) => {
    if (!text) return text;

    // Create regex pattern dynamically from the keys, making it case-insensitive and allowing for optional punctuation
    const regexPattern = new RegExp(
      `\\b(${Object.keys(abbreviations).join("|")})\\b|(${Object.keys(
        abbreviations
      ).join("|")})\\.`, // Handle punctuation
      "gi" // "gi" for case-insensitivity and global matching
    );

    // Replace matches with their full form
    return text.replace(regexPattern, (match, group1, group2) => {
      // If the match includes a trailing dot, strip it off before checking the abbreviation
      const key = group1 || group2;
      const fullForm = abbreviations[key.toUpperCase()] || key;
      return group2 ? fullForm + "." : fullForm;
    });
  };

  const formatAddress = (address) => {
    return address
      .replace(/\. /g, ".  ") // Add two spaces after periods
      .replace(/, /g, ",  "); // Add two spaces after commas
  };

  const cleanValue = (value, fieldName, data) => {
    // Handle empty or null values with appropriate tags
    if (!value || value.trim() === "") {
      // If the field has a tag rule, wrap "Data Not Available" with the appropriate tags
      if (tagRules[fieldName]) {
        return `*${tagRules[fieldName]("Data Not Available")}*`;
      }
      return "*<B>Data Not Available<B>*";
    }

    let cleanedValue = value.replace(/^\[|\]$/g, "").trim();

    // Convert currency symbols to words
    cleanedValue = cleanedValue
      .replace(/\$/g, "Dollar ")
      .replace(/€/g, "Euro ")
      .replace(/£/g, "Pound ")
      .replace(/¥/g, "Yen ");

    // Expand abbreviations for all fields except Website and EmailId
    if (fieldName !== "Website" && fieldName !== "EmailId") {
      cleanedValue = expandAbbreviations(cleanedValue);
    }

    // Handle specific field formatting
    switch (fieldName) {
      case "Website":
        cleanedValue = cleanedValue
          .toLowerCase()
          .replace(/\s+/g, "")
          .replace(/^(?!https:\/\/www\.)/i, "https://www.");
        break;

      case "EmailId":
        cleanedValue = cleanedValue.toLowerCase().replace(/\s+/g, "");
        break;

      case "CompanyAddress":
        cleanedValue = formatAddress(cleanedValue);
        const phoneMatch = cleanedValue.match(
          /(?:Phone|Tel|T):\s*([0-9+\s()-]+)/i
        );
        const faxMatch = cleanedValue.match(/(?:Fax|F):\s*([0-9+\s()-]+)/i);
        if (phoneMatch) {
          data["ContactNumber"] = phoneMatch[1].replace(/-/g, "").trim();
          cleanedValue = cleanedValue.replace(phoneMatch[0], "");
        }
        if (faxMatch) {
          data["Fax"] = faxMatch[1].replace(/-/g, "").trim();
          cleanedValue = cleanedValue.replace(faxMatch[0], "");
        }
        break;

      case "ContactNumber":
      case "Fax":
      case "NumEmployees":
      case "DataNumber":
        cleanedValue = cleanedValue.replace(/-/g, "");
        break;

      case "RegistrationDate":
        cleanedValue = formatDate(cleanedValue);
        break;

      default:
        if (fieldName !== "Website" && fieldName !== "EmailId") {
          cleanedValue = capitalizeWords(cleanedValue);
        }
    }

    // Apply HTML tags if there's a rule for this field
    // Ensure no spaces before or after tags
    if (tagRules[fieldName]) {
      cleanedValue = tagRules[fieldName](cleanedValue.trim());
    }

    return cleanedValue;
  };

  const replaceAbbreviations = (text) => {
    if (!text) return text;

    // Create regex pattern dynamically from the keys
    const regexPattern = new RegExp(
      `\\b(${Object.keys(abbreviations).join("|")})\\b`,
      "g"
    );

    // Replace matches with their full form
    return text.replace(regexPattern, (match) => abbreviations[match] || match);
  };

  const parseFormData = (text) => {
    const lines = text.split("\n");
    const data = {};
    let currentField = "";

    const fieldMapping = {
      "Form No.": "FormNumber",
      "Form No": "FormNumber",
      "Company Name": "CompanyName",
      "Company Address": "CompanyAddress",
      Product: "Product",
      Website: "Website",
      Email: "EmailId",
      Country: "Country",
      Headquarters: "HeadQuarter",
      Industry: "Industry",
      "Registration Date": "RegistrationDate",
      "Yearly Revenue": "YearlyRevenue",
      "Yearly Expense": "YearlyExpense",
      Currency: "Currency",
      "Brand Ambassador": "BrandAmbassador",
      "Data Number": "DataNumber",
      "Zip Code": "ZipCode",
      "Media Partner": "MediaPartner",
      "Social Media": "SocialMedia",
      "Franchise Partner": "FranchisePartner",
      "Advertising Partner": "AdvertisingPartner",
      Investor: "Investor",
      "Acc Audit": "AccAudit",
      Services: "Services",
      Landmark: "Landmark",
      "Num Employees": "NumEmployees",
      "Number of Employees": "NumEmployees",
      "Work Sample": "WorkSample",
      Filename: "Filename",
      Manager: "Manager",
      "Sub Classification": "SubClassification",
      "Sub-Classification": "SubClassification",
      Tel: "ContactNumber",
      Phone: "ContactNumber",
      Contact: "ContactNumber",
    };

    lines.forEach((line) => {
      line = line.trim();
      if (!line) return;

      const colonMatch = line.match(/([^:]+):\s*(.+)/);
      if (colonMatch) {
        const [_, field, value] = colonMatch;
        const standardField = fieldMapping[field.trim()] || field.trim();
        currentField = standardField;
        data[standardField] = cleanValue(value.trim(), standardField, data);
        return;
      }

      // Handle multi-line values (like addresses)
      if (currentField && !line.includes(":")) {
        data[currentField] = cleanValue(
          data[currentField] + " " + line.trim(),
          currentField,
          data
        );
        return;
      }

      // If no colon, try to split by multiple spaces
      const parts = line
        .split(/\s{2,}/)
        .map((str) => str.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        const fieldName = parts[0];
        const standardField = fieldMapping[fieldName] || fieldName;
        currentField = standardField;
        data[standardField] = cleanValue(
          parts.slice(1).join(" "),
          standardField,
          data
        );
      }
    });

    console.log(data);
    return data;
  };

  const processImage = async () => {
    if (!image) return;

    setLoading(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Convert image to proper format
      const imageData = await fileToGenerativePart(image);

      const prompt = `Please analyze this form image carefully and extract the exact text for each field.

Follow these rules strictly:
1. Maintain exact capitalization and spacing
2. Include all special characters and punctuation
3. For addresses, keep the complete text including commas and periods
4. For numbers, ensure exact digit recognition
5. For email addresses, maintain exact spelling and format

Format each field exactly as shown below:
FormNumber: [exact form number]
FormNumberId: [exact form number id]
CompanyName: [exact company name]
YearlyRevenue: [exact revenue amount]
Website: [exact website URL]
EmailId: [exact email address]
Country: [exact country name]
HeadQuarter: [exact headquarters location]
Industry: [exact industry type]
Product: [exact product details]
RegistrationDate: [exact registration date]
NumEmployees: [exact number of employees]
CompanyAddress: [complete address with exact formatting]
WorkSample: [work sample details]
DataNumber: [exact data number]
ZipCode: [exact zip code]
BrandAmbassador: [brand ambassador details]
MediaPartner: [media partner details]
SocialMedia: [social media details]
FranchisePartner: [franchise partner details]
AdvertisingPartner: [advertising partner details]
Investor: [investor details]
AccAudit: [accounting audit details]
Services: [services details]
Landmark: [exact landmark details]
Currency: [exact currency type]
YearlyExpense: [exact expense amount]
Filename: [exact filename]
Manager: [exact manager name]
SubClassification: [exact sub-classification]
Fax: [exact fax number]
CompanyCode: [exact company code]
State: [exact state]
`;

      // Use the enhanced API call with retry logic
      const result = await callGeminiWithRetry(model, prompt, imageData);
      const response = await result.response;
      const text = response.text();

      try {
        const parsedData = parseFormData(text);
        if (handleFormSubmission(parsedData)) {
          setFormData(parsedData);
          setToast({
            message: "Form data extracted successfully!",
            type: "success",
          });
        }
      } catch (parseError) {
        console.error("Parse error:", parseError);
        throw new Error("Failed to parse API response as JSON");
      }
    } catch (error) {
      console.error("Error processing image:", error);
      setToast({
        message: error.message || "Failed to process image. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmission = (formData) => {
    // If no form data, return false
    if (!formData) {
      showToast("No form data available", "error");
      return false;
    }

    const formId = formData.FormNumber || formData.FormNumberId;

    // If no form ID, still allow processing but show warning
    if (!formId) {
      showToast("Warning: Form has no ID", "warning");
      return true;
    }

    // Check if form has already been processed
    if (processedForms.has(formId)) {
      showToast("Warning: This form has already been processed", "warning");
      return true;
    }

    // Check if form is empty (all fields are "Data Not Available")
    const hasData = Object.values(formData).some(
      (value) => value && !value.includes("Data Not Available")
    );

    if (!hasData) {
      showToast("Warning: All fields are empty or unavailable", "warning");
      return true;
    }

    // Add form to processed set if it has an ID
    if (formId) {
      setProcessedForms((prev) => new Set([...prev, formId]));
    }

    return true;
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="static"
        sx={{
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ minHeight: { xs: "64px", sm: "70px" } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <img
              src="/gemini-logo.png"
              alt="Logo"
              style={{ height: 32, filter: "brightness(0.8) invert(1)" }}
            />
            <Typography
              variant="h6"
              component="h1"
              sx={{
                color: "text.primary",
                fontWeight: 500,
                fontSize: { xs: "1.125rem", sm: "1.25rem" },
              }}
            >
              Form Data Extractor
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { md: "350px 1fr" },
          gap: 2,
          height: "calc(100vh - 70px)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 3,
            borderRight: "1px solid",
            borderColor: "divider",
            overflowY: "auto",
          }}
        >
          <Box sx={{ height: "100%" }}>
            <DropZone
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleImageUpload({ target: { files: [file] } });
              }}
              onDragOver={(e) => e.preventDefault()}
              sx={{
                minHeight: 250,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                border: "2px dashed",
                borderColor: "divider",
                borderRadius: 3,
                bgcolor: "background.paper",
                transition: "all 0.2s ease-in-out",
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "action.hover",
                },
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 2,
                  bgcolor: "primary.dark",
                }}
              >
                <CloudUploadIcon sx={{ fontSize: 32, color: "primary.main" }} />
              </Box>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h6" sx={{ color: "text.primary", mb: 1 }}>
                  Drop your image here
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  or click to browse from your computer
                </Typography>
              </Box>
              <VisuallyHiddenInput
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </DropZone>

            {image && (
              <Box sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={processImage}
                  disabled={loading}
                  sx={{
                    height: 48,
                    textTransform: "none",
                    fontSize: "1rem",
                    boxShadow: "none",
                    "&:hover": {
                      boxShadow:
                        "0 1px 3px 0 rgb(60 64 67 / 30%), 0 4px 8px 3px rgb(60 64 67 / 15%)",
                    },
                  }}
                >
                  {loading ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={20} thickness={5} />
                      <span>Extracting...</span>
                    </Box>
                  ) : (
                    "Extract Form Data"
                  )}
                </Button>
              </Box>
            )}
          </Box>

          <Box sx={{ flex: 1 }}>
            {image && (
              <Paper
                elevation={0}
                sx={{
                  mb: 3,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      color: "text.primary",
                      fontSize: "1.125rem",
                      fontWeight: 500,
                    }}
                  >
                    Image Preview
                  </Typography>
                </Box>
                <Box sx={{ p: 3, bgcolor: "#fff" }}>
                  <Box
                    sx={{
                      width: "100%",
                      borderRadius: 2,
                      overflow: "hidden",
                      boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    <img
                      src={URL.createObjectURL(image)}
                      alt="Preview"
                      style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                      }}
                    />
                  </Box>
                </Box>
              </Paper>
            )}

            {formData && (
              <Paper
                elevation={0}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  bgcolor: "background.paper",
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      color: "text.primary",
                      fontSize: "1.125rem",
                      fontWeight: 500,
                    }}
                  >
                    Extracted Form Data
                  </Typography>
                </Box>
                <TableContainer sx={{ px: 2 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell
                          sx={{
                            color: "text.secondary",
                            fontWeight: 500,
                            fontSize: "0.875rem",
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            py: 2,
                          }}
                        >
                          Field
                        </TableCell>
                        <TableCell
                          sx={{
                            color: "text.secondary",
                            fontWeight: 500,
                            fontSize: "0.875rem",
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            py: 2,
                          }}
                        >
                          Value
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(formData).map(([field, value]) => (
                        <TableRow
                          key={field}
                          sx={{
                            "&:hover": {
                              bgcolor: "action.hover",
                            },
                          }}
                        >
                          <TableCell
                            sx={{
                              py: 2,
                              color: "text.primary",
                              borderBottom: "1px solid",
                              borderColor: "divider",
                            }}
                          >
                            {field}
                          </TableCell>
                          <TableCell
                            sx={{
                              py: 2,
                              color: "text.primary",
                              borderBottom: "1px solid",
                              borderColor: "divider",
                            }}
                          >
                            {value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box
                  sx={{
                    p: 3,
                    bgcolor: "background.paper",
                    borderTop: "1px solid #dadce0",
                    display: "flex",
                    gap: 2,
                  }}
                >
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => {
                      navigator.clipboard.writeText(
                        JSON.stringify(formData, null, 2)
                      );
                      showToast("JSON data copied to clipboard");
                    }}
                    sx={{
                      borderColor: "divider",
                      color: "primary.main",
                      "&:hover": {
                        borderColor: "primary.main",
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    Copy as JSON
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<CodeIcon />}
                    onClick={() => {
                      if (!formData) {
                        showToast("No form data available", "error");
                        return;
                      }

                      // Validate form but don't block on warnings
                      handleFormSubmission(formData);

                      const script = generateFormFillingScript(formData);
                      navigator.clipboard.writeText(script);
                      showToast("Form filling script copied to clipboard");
                      setModalContent(
                        <Box sx={{ color: "#202124" }}>
                          <Typography
                            variant="h6"
                            gutterBottom
                            sx={{
                              fontSize: "1.125rem",
                              fontWeight: 500,
                              color: "#202124",
                            }}
                          >
                            Form Filling Script Copied!
                          </Typography>
                          <Typography
                            variant="body1"
                            gutterBottom
                            sx={{ color: "#5f6368" }}
                          >
                            To use the script:
                          </Typography>
                          <Box
                            component="ol"
                            sx={{
                              pl: 2,
                              "& li": {
                                mb: 1,
                                color: "#5f6368",
                              },
                            }}
                          >
                            <li>Go to your form website</li>
                            <li>Open Developer Tools (F12)</li>
                            <li>Go to Console tab</li>
                            <li>Paste the copied script</li>
                            <li>Press Enter</li>
                          </Box>
                        </Box>
                      );
                      setShowModal(true);
                    }}
                    sx={{
                      bgcolor: "primary.main",
                      "&:hover": {
                        bgcolor: "primary.dark",
                      },
                    }}
                  >
                    Copy Form Filling Script
                  </Button>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={toast !== null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast(null)}
          severity={toast?.type || "success"}
          sx={{ width: "100%" }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={showModal}
        onClose={() => setShowModal(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ m: 0, p: 2 }}>
          Instructions
          <IconButton
            onClick={() => setShowModal(false)}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>{modalContent}</DialogContent>
        <DialogActions>
          <Button onClick={() => setShowModal(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
