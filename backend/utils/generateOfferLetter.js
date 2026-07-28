const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle,
} = require("docx");

// Builds the actual offer/internship letter as a .docx Buffer, using the
// same structure as the real Prepreneurship template Shafaat provided -
// applied as one shared template across all 6 companies, with the
// legal employer name substituted per company and the Intern/Employee
// clauses swapped based on employment type. If a company later needs its
// own distinct wording, that's a per-company template override to add
// later - for now this is intentionally one shared shape.
function generateOfferLetter({ company, offer, onboarding }) {
  const isIntern = onboarding.employmentType === "Intern";
  const legalName = company.legalEmployerName || company.name;

  const joinDate = new Date(onboarding.dateOfJoining);
  const endDate = new Date(joinDate);
  if (isIntern) {
    endDate.setMonth(endDate.getMonth() + (onboarding.internshipDurationMonths || 3));
  }
  const fmt = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const heading = (text) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 }, children: [new TextRun({ text, bold: true })] });

  const body = (text) => new Paragraph({ spacing: { after: 150 }, children: [new TextRun(text)] });

  const bullet = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun(text)] });

  const natureLine = isIntern
    ? `This is an unpaid professional internship program intended for skill development and practical experience, for a duration of ${onboarding.internshipDurationMonths || 3} month(s), commencing from ${fmt(joinDate)} to ${fmt(endDate)}.`
    : `This is a paid ${onboarding.employmentType.toLowerCase()} position, commencing from ${fmt(joinDate)}.`;

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: legalName.toUpperCase(), bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: `Date: ${fmt(new Date())}    Ref No: PP-HR-${new Date().getFullYear()}-${String(offer._id).slice(-4).toUpperCase()}` })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: isIntern ? "INTERNSHIP & CONFIDENTIALITY AGREEMENT" : "EMPLOYMENT OFFER & CONFIDENTIALITY AGREEMENT", bold: true, size: 26 })],
    }),
    body(`Subject: ${isIntern ? "Internship Offer & Confidentiality Agreement" : "Employment Offer & Confidentiality Agreement"}`),
    body(`Dear ${onboarding.employeeName} D/o ${onboarding.fatherName}`),
    body(
      `We are pleased to offer you ${isIntern ? "an internship position" : "a position"} as ${offer.designation} at ${legalName}. This letter sets out the terms and conditions of your ${isIntern ? "internship" : "employment"}, which you are required to read, understand, and accept in full.`
    ),

    heading(`1. ${isIntern ? "Internship" : "Employment"} Terms & Schedule`),
    bullet(`Duration: ${natureLine}`),
    bullet(`Working Hours: ${offer.timings || "As communicated by your Team Lead"}.`),
    bullet(`Nature: ${isIntern ? "This is an unpaid professional internship program intended for skill development and practical experience." : `This is a paid ${onboarding.employmentType.toLowerCase()} role.`}`),

    heading("2. Reporting Structure"),
    body(`You shall report to ${onboarding.reportsTo}. You remain directly accountable to the Chief Executive Officer (CEO) through the established hierarchy.`),

    heading("3. Job Responsibilities"),
    body(offer.jobDescription),
    ...(offer.kpis && offer.kpis.length > 0
      ? [body("Key Performance Indicators:"), ...offer.kpis.map((k) => bullet(k))]
      : []),

    heading("4. Intellectual Property & Confidentiality"),
    body("(This is a crucial clause and a condition of this agreement.)"),
    bullet(`Company Ownership: All work, code, algorithms, designs, documents, and ideas created by you during this ${isIntern ? "internship" : "employment"} are the sole and exclusive property of ${legalName}.`),
    bullet("Non-Disclosure & Usage: You are strictly prohibited from sharing, copying, selling, or distributing any of the company's proprietary information, source code, or business ideas to any third party, including friends, family, or other entities."),
    bullet("No Personal Use: You shall not use any of the company's intellectual property for personal projects or personal gain."),
    bullet(`Legal Consequences: Any breach of this confidentiality or unauthorized use of company assets will be treated as a severe violation. ${legalName} reserves the right to initiate strict legal proceedings, including civil and criminal action, for any such breach of trust or data theft.`),

    heading("5. Conduct & Termination"),
    body("Professionalism and adherence to company policies are mandatory. Failure to comply with these guidelines, or poor performance, may result in the immediate termination of this agreement without prior notice."),

    ...(isIntern
      ? [
          heading("6. Certification"),
          body("A certificate of completion will be awarded only upon the successful and satisfactory fulfilment of your duties and adherence to all company protocols."),
        ]
      : []),

    heading("Acceptance & Undertaking"),
    body(`I, ${onboarding.employeeName}, have read, understood, and agreed to all the terms and conditions mentioned above. I fully acknowledge the consequences of violating the confidentiality and intellectual property clauses, and I undertake to abide by all policies of ${legalName}.`),

    new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "For the Team Lead", bold: true })] }),
    body("________________________"),
    body("Candidate Signature"),
    body(`Name: ${onboarding.employeeName}`),
    body(`CNIC: ${onboarding.cnic}`),
    body(`Date: ______________`),

    new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: "For the Company", bold: true })] }),
    body("________________________"),
    body("Authorized Signatory (CEO)"),
    body(`${legalName}`),

    new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "Enclosures / Office Use Only", italics: true, bold: true })] }),
    bullet("A copy of the candidate's CNIC is to be attached with this agreement."),
    bullet("This agreement may be printed on a stamp paper of nominal value for additional legal standing."),
    bullet("A signed scanned copy to be retained digitally; one hard copy to be kept in the office file."),
  ];

  return new Document({ sections: [{ children }] });
}

async function generateOfferLetterBuffer(args) {
  const doc = generateOfferLetter(args);
  return Packer.toBuffer(doc);
}

module.exports = { generateOfferLetterBuffer };