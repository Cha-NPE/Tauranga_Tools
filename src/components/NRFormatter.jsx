import { useRef, useState } from "react";
import "./styles.css";

// ---- Output format (matches the Tauranga NR job descriptions in simPRO) ----
// Every line is a 10pt div, like the descriptions the Tauranga office types up.
const LINE_STYLE = "font-size: 10pt;";
const TEXT_STYLE = "font-size: 13.3333px;";
const RED_STYLE = "color: #ff0000;";

// Order number for each Powerco area code in the job name (NR-<CIWR>-<code>-...).
const ORDER_NUMBERS = {
    EBP: "4100000591", // Tauranga & Mt Maunganui
    EVL: "4100000588"  // Coromandel & South Waikato
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

const line = inner => `<div style="${LINE_STYLE}"><span style="${TEXT_STYLE}">${inner}</span></div>`;
const blankLine = () => line("&nbsp;");
const bold = text => `<strong>${escapeHtml(text)}</strong>`;
const boldRed = text => `<strong><span style="${RED_STYLE}">${escapeHtml(text)}</span></strong>`;
// "Label: value" with the value as plain text (an empty value still shows the label).
const field = (label, value) => line(`${escapeHtml(label)}: ${escapeHtml(value)}`);
// "Label: value" with only the label in bold.
const boldLabelField = (label, value) => line(`${bold(label + ":")} ${escapeHtml(value)}`);
const heading = text => line(bold(text));

function NRFormatter() {
    const sapInputRef = useRef(null);
    const [emailText, setEmailText] = useState("");
    const [outputHtml, setOutputHtml] = useState("");
    const [clearInputsOnCopy, setClearInputsOnCopy] = useState(false);

    function getValue(text, startLabel, endLabels = null) {
        const startIndex = text.indexOf(startLabel);

        if (startIndex === -1) { return ""; }

        const valueStart = startIndex + startLabel.length;
        let valueEnd = text.length;

        if (endLabels) {
            if (!Array.isArray(endLabels)) { endLabels = [endLabels]; }

            endLabels.forEach(label => {
                const index = text.indexOf(label, valueStart);
                if (index !== -1 && index < valueEnd) {valueEnd = index;}
            });
        }

        return text.substring(valueStart, valueEnd).trim();
    }

    function getSection(text, sectionHeader, nextHeaders = []){
        const startIndex = text.indexOf(sectionHeader);

        if (startIndex === -1) { return "";}

        const contentStart = startIndex + sectionHeader.length;

        let endIndex = text.length;
        nextHeaders.forEach(header => {
            const index = text.indexOf(header, contentStart);

            if (index !== -1 && index < endIndex){ endIndex = index;}
        });

        return text.substring(contentStart, endIndex).trim();
    }

    // Finds a label anywhere in the text and returns the value after it (same line or next line).
    function getLineValue(text, label) {
        const match = text.match(new RegExp(label + "\\s*:?\\s*([^\\r\\n]*)", "i"));
        return match ? match[1].trim() : "";
    }

    function convertSAPText() {
        const text = sapInputRef.current.innerText;
        const originalHTML = sapInputRef.current.innerHTML;
        
        // The connection section is "NEW CONNECTION" or "CURRENT CONNECTION" (decommissions).
        const connectionHeader = (text.match(/CONNECTION DETAILS[^\r\n]*/) || ["CONNECTION DETAILS - NEW CONNECTION"])[0].trim();
        const siteDetailsSection = getSection(text, "SITE DETAILS", ["CONNECTION DETAILS"]);
        const connectionSection = getSection(text, connectionHeader, ["APPLICANT DETAILS", "ELECTRICIAN DETAILS"]);
        const applicantSection = getSection(text, "APPLICANT DETAILS", ["ELECTRICIAN DETAILS", "ELECTRICITY BILL PAYER DETAILS"]);
        const electricianSection = getSection(text, "ELECTRICIAN DETAILS", ["ELECTRICITY BILL PAYER DETAILS", "APPLICANT DETAILS"]);
        const billPayerSection = getSection(text, "ELECTRICITY BILL PAYER DETAILS", ["OTHER DETAILS"]);
        const otherSection = getSection(text, "OTHER DETAILS", []);

        //Email input
        const emailContent = emailText;

        //Details from email
        const workOrderNumber = getValue(emailContent, "Work order number:", "Subject:");
        const fullSubject = getValue(emailContent, "Subject:", "Work order status:");
        const parts = fullSubject.split("-");
        const subject = parts.slice(0, 3).join("-");
        const areaCode = (parts[2] || "").trim().toUpperCase();
        const orderNumber = ORDER_NUMBERS[areaCode] || "";
        const icpFromEmail = getValue(emailContent, "ICP number:", "END");

        //Details from SAP
        const jobClassification = getValue(text, "Network Ready Job Classification:", ["Permanent/Temporary:", "SITE DETAILS"]);
        const permanent = getValue(text, "Permanent/Temporary:", "SITE DETAILS");

        const icpNumber = getValue(siteDetailsSection, "ICP Number (if existing):", ["Site Address:", "Legal Description:"]) || icpFromEmail;
        const siteAddress = getValue(siteDetailsSection, "Site Address:", ["Legal Description:", "Additional Details"]);
        // Job name address in capitals, like the existing Tauranga job names.
        const jobNameAddress = siteAddress.toUpperCase().replace(/\s+,/g, ",");
        const legalDescription = getValue(siteDetailsSection, "Legal Description:", "Additional Details:");
        const additionalDetails = getValue(siteDetailsSection, "Additional Details:", "Meter Number");

        const phasesRequired = getValue(connectionSection, "Phases Required:",["Load Demand:", "Required"]);
        const loadDemand = getValue(connectionSection, "Load Demand:", ["BTS Installation Details:", "Asset Type:"]);
        const assetType = getValue(connectionSection, "Asset Type:", ["Asset Number:", "Transformer Site ID:"]);
        const assetNumber = getValue(connectionSection, "Asset Number:", "Transformer Site ID:");
        const transformerSite = getValue(connectionSection, "Transformer Site ID:", "High Level Job Scope:");
        const jobScope = getValue(connectionSection, "High Level Job Scope:", ["Land Description:", "Comments:"]);
        const landDescription = getValue(connectionSection, "Land Description:", "Comments:");
        const comments = getValue(connectionSection, "Comments:");

        const contactFields = ["Company:", "Name:", "Phone:", "Email:", "Nominated Inspector/Meter Installer:"];
        const contact = section => {
            const get = (label) => getValue(section, label, contactFields.filter(f => f !== label));
            return {
                company: get("Company:"),
                name: get("Name:"),
                phone: get("Phone:"),
                email: get("Email:"),
                inspector: get("Nominated Inspector/Meter Installer:")
            };
        };
        const electrician = contact(electricianSection);
        const applicant = contact(applicantSection);
        const billPayer = contact(billPayerSection);
        const inspector = electrician.inspector || applicant.inspector;

        const energyRetailer = getValue(otherSection, "Energy Retailer:", ["Date Fieldwork Is Required:", "Known Hazards:", "Project Manager Name:"]);
        const fieldworkDate = getValue(otherSection, "Date Fieldwork Is Required:", ["Known Hazards:", "Project Manager Name:"]);
        const knownHazards = getValue(otherSection, "Known Hazards:", "Project Manager Name:");
        const projectManagerName = getLineValue(text, "Project Manager Name");

        // Job Type is left blank; it's filled in by hand in simPRO.
        const isDecommission = jobClassification.toLowerCase().includes("decommission");

        // Site address in capitals, with the lot number added from the legal description.
        const lot = (legalDescription.match(/\bLot\s+([A-Za-z0-9]+)/i) || [])[1];
        let displayAddress = siteAddress.toUpperCase().replace(/\s+,/g, ",");
        if (lot && !/\bLOT\b/.test(displayAddress)) displayAddress += ` - LOT ${lot.toUpperCase()}`;

        const contactBlock = (title, person, showEmptyCompany = true) => [
            heading(title),
            (showEmptyCompany || person.company) ? field("Company", person.company) : "",
            field("Name", person.name),
            field("Phone", person.phone),
            field("Email", person.email)
        ];

        //Formatted output
        const output = [
            // Read (and removed) by the Tauranga Job bookmarklet
            `<div>${escapeHtml(workOrderNumber)} ${escapeHtml(subject)}-${escapeHtml(jobNameAddress)}</div>`,
            `<div>${orderNumber}</div>`,

            line(bold("Job Type:")),
            blankLine(),

            heading("SITE DETAILS"),
            isDecommission ? field("ICP Number (if existing)", icpNumber) : "",
            line(`Site Address: ${boldRed(displayAddress)}`),
            legalDescription ? field("Legal Description", legalDescription) : "",
            additionalDetails ? field("Additional Details", additionalDetails) : "",
            blankLine(),

            heading(connectionHeader),
            isDecommission ? "" : field("Phases Required", phasesRequired),
            isDecommission ? "" : field("Load Demand", loadDemand),
            line(boldRed(`Asset Type: ${[assetType, assetNumber].filter(Boolean).join(" ")}`)),
            field("Transformer Site ID", transformerSite),
            blankLine(),
            boldLabelField("High Level Job Scope", jobScope),
            landDescription ? field("Land Description", landDescription) : "",
            comments ? field("Comments", comments) : "",
            blankLine(),

            ...contactBlock("ELECTRICIAN DETAILS", electrician),
            blankLine(),
            boldLabelField("Nominated Inspector/Meter Installer", inspector),
            blankLine(),

            ...contactBlock("APPLICANT DETAILS", applicant),
            blankLine(),

            ...contactBlock("ELECTRICITY BILL PAYER DETAILS", billPayer, false),
            blankLine(),

            heading("OTHER DETAILS"),
            field("Energy Retailer", energyRetailer),
            field("Date Fieldwork Is Required", fieldworkDate),
            field("Known Hazards", knownHazards),
            field("Project Manager Name", projectManagerName)
        ].filter(Boolean).join("");

        setOutputHtml(output);
    }

    async function copyOutput() {
        const temp = document.createElement("div");
        temp.innerHTML = outputHtml;
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob([outputHtml], {type: "text/html"}),
                "text/plain": new Blob([temp.innerText], {type: "text/plain"})
            })
        ]);

        if (clearInputsOnCopy) {
            if (sapInputRef.current) {
                sapInputRef.current.innerHTML = "";
                sapInputRef.current.textContent = "";
            }
            setEmailText("");
        }
    }

    return (
        <>
            <h1>Network Ready Formatter</h1>

            <div className="inputBoxes">
                <div ref={sapInputRef} className="GW-input" contentEditable suppressContentEditableWarning/>

                <textarea placeholder= "WO Email Text" value={emailText}
                    onChange={(e) =>
                        setEmailText(
                            e.target.value
                        )
                    }
                />
            </div>

            <div className= "centered-buttons-div">
                <button onClick={convertSAPText}>Convert</button>
                <button onClick={copyOutput}>Copy Output</button>
            </div>
            <div className="centered-buttons-div">
                <label style={{ marginTop: "12px", marginBottom: "12px" }}>
                    <input
                        type="checkbox"
                        checked={clearInputsOnCopy}
                        onChange={(e) => setClearInputsOnCopy(e.target.checked)}
                    />
                    Clear input boxes after copy
                </label>
            </div>

            <div className="output" dangerouslySetInnerHTML={{__html:outputHtml}}/>
        </>
    );
}

export default NRFormatter;
