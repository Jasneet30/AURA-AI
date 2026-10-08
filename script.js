const firebaseConfig = {
  apiKey: "AIzaSyCdlyVP4wM7spDd5bcU6PbMTszn9323pas",
  authDomain: "aura-ai-eb547.firebaseapp.com",
  projectId: "aura-ai-eb547",
  storageBucket: "aura-ai-eb547.firebasestorage.app",
  messagingSenderId: "987517360005",
  appId: "1:987517360005:web:fc4c424e827ae6dc0e96ec"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

console.log("Firebase connected!");

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/xlN57fswl/";

let model;
let video = document.getElementById("video");
let canvas = document.getElementById("canvas");

const startCamera =
    document.getElementById("startCamera");

const capture =
    document.getElementById("capture");

const result =
    document.getElementById("result");

let cameraStream = null;


// ==============================
// LOAD AI MODEL
// ==============================

async function loadModel() {

    result.innerHTML = "Loading AI model...";

    model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
    );

    result.innerHTML =
    "Camera is ready. Take your photo.";
    console.log("AI Model Loaded");
}


// ==============================
// OPEN CAMERA
// ==============================

startCamera.onclick = async function () {

    try {

        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user"
                },
                audio: false
            });

        video.srcObject = cameraStream;

        video.style.display = "block";

        capture.style.display = "inline-block";

        startCamera.style.display = "none";

        result.innerHTML =
            "";

    } catch (error) {

        console.error(error);

        result.innerHTML =
            "Unable to access camera. Please allow camera permission.";

    }
};


// ==============================
// TAKE PHOTO
// ==============================

capture.onclick = async function () {

    // Make sure camera is running
    if (!cameraStream) {
        return;
    }

    // Set canvas size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Capture current frame
    const context =
        canvas.getContext("2d");

    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );


    // ==========================
    // STOP CAMERA
    // ==========================

    cameraStream
        .getTracks()
        .forEach(track => track.stop());

    cameraStream = null;

    video.srcObject = null;

    // Hide live camera
    video.style.display = "none";

    // Hide capture button
    capture.style.display = "none";

    // Hide open camera button
    startCamera.style.display = "none";


    // ==========================
    // SHOW CAPTURED PHOTO
    // ==========================

    canvas.style.display = "block";

    canvas.style.width = "100%";

    canvas.style.maxWidth = "500px";

    canvas.style.margin = "20px auto";

    canvas.style.borderRadius = "20px";


    result.innerHTML = `
    <div class="analyzing">
        <div class="loader"></div>
        <h3>Analysing your skin...</h3>
        <p>AURA AI is finding the best recommendations for you.</p>
    </div>
`;

    // ==========================
    // ANALYZE PHOTO
    // ==========================

    await analyzeImage();

};


// ==============================
// AI ANALYSIS
// ==============================

async function analyzeImage() {

    try {

        const prediction = await model.predict(canvas);

        prediction.sort((a, b) => b.probability - a.probability);

        const highest = prediction[0];

        const percentage =
            Math.round(highest.probability * 100);

        let observations = "";

        prediction.forEach(p => {

            const score =
                Math.round(p.probability * 100);

            observations += `
                <div style="
                    margin:10px 0;
                    padding:10px;
                    background:#f5f5f5;
                    border-radius:10px;
                ">
                    <strong>${p.className}</strong>

                    <span style="float:right">
                        ${score}%
                    </span>
                </div>
            `;
        });


        result.innerHTML = `

            <h2>AI Skin Analysis</h2>

            <h3>
                Primary Observation:
                ${highest.className}
            </h3>

            <p>
                Confidence:
                <strong>${percentage}%</strong>
            </p>

            <hr>

            <h3>Observations</h3>

            ${observations}

            <hr>

            ${getRecommendation(highest.className)}

            <div style="
                margin-top:25px;
                padding:20px;
                background:#f7f7f7;
                border-radius:15px;
            ">

                <h3>
                    Was this observation correct?
                </h3>

                <button id="correctBtn"
                    style="
                    padding:12px 20px;
                    margin:5px;
                    border:none;
                    border-radius:20px;
                    cursor:pointer;
                    ">
                    👍 Yes, Correct
                </button>

                <button id="wrongBtn"
                    style="
                    padding:12px 20px;
                    margin:5px;
                    border:none;
                    border-radius:20px;
                    cursor:pointer;
                    ">
                    👎 No, Correct It
                </button>

                <div id="feedbackArea"></div>

            </div>

            <button id="retake"
                style="
                margin-top:20px;
                padding:12px 25px;
                border:none;
                border-radius:25px;
                cursor:pointer;
                ">
                📸 Retake Photo
            </button>
        `;


        // USER SAYS YES

        document.getElementById("correctBtn").onclick =
            async function () {

                await saveScan(
                    highest.className,
                    highest.probability,
                    true,
                    highest.className
                );

                document.getElementById("feedbackArea").innerHTML = `
                    <p style="color:green;">
                        ✅ Thank you! Feedback saved.
                    </p>
                `;
            };


        // USER SAYS NO

        document.getElementById("wrongBtn").onclick =
            function () {

                document.getElementById("feedbackArea").innerHTML = `

                    <h4>
                        What is the correct observation?
                    </h4>

                    <select id="correctLabel"
                        style="
                        padding:10px;
                        border-radius:10px;
                        margin:5px;
                        ">

                        <option value="">
                            Select
                        </option>

                        <option value="Clear Skin">
                            Clear Skin
                        </option>

                        <option value="Acne / Blemishes">
                            Acne / Blemishes
                        </option>

                        <option value="Pigmentation">
                            Pigmentation
                        </option>

                        <option value="Redness">
                            Redness
                        </option>

                    </select>

                    <button id="submitCorrection"
                        style="
                        padding:10px 18px;
                        border:none;
                        border-radius:20px;
                        cursor:pointer;
                        ">
                        Submit Correction
                    </button>
                `;


                document.getElementById(
                    "submitCorrection"
                ).onclick = async function () {

                    const correctedLabel =
                        document.getElementById(
                            "correctLabel"
                        ).value;


                    if (!correctedLabel) {

                        alert(
                            "Please select the correct observation."
                        );

                        return;
                    }


                    await saveScan(
                        highest.className,
                        highest.probability,
                        false,
                        correctedLabel
                    );


                    document.getElementById(
                        "feedbackArea"
                    ).innerHTML = `

                        <p style="color:green;">
                            ✅ Correction saved!
                        </p>

                    `;
                };
            };


        // RETAKE PHOTO

        document.getElementById("retake").onclick =
            function () {

                canvas.style.display = "none";

                result.innerHTML =
                    "Opening camera...";

                startCamera.click();
            };


    } catch (error) {

        console.error(error);

        result.innerHTML =
            "Unable to analyze the photo.";

    }
}
async function saveScan(
    prediction,
    confidence,
    correct,
    correctedLabel
) {

    try {

        // Convert captured photo to compressed JPEG
        const photoData =
            canvas.toDataURL(
                "image/jpeg",
                0.5
            );


        await db.collection("scans").add({

            prediction: prediction,

            confidence:
                Math.round(confidence * 100),

            correct: correct,

            correctedLabel:
                correctedLabel,

            modelVersion:
                "V1",

            photo:
                photoData,

            timestamp:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        console.log(
            "Scan successfully saved to Firestore"
        );


    } catch (error) {

        console.error(
            "Error saving scan:",
            error
        );

        alert(
            "Could not save feedback."
        );
    }
}


// ==============================
// RECOMMENDATIONS
// ==============================

// function getRecommendation(concern) {


//     if (concern ===
//         "Acne / Blemishes") {

//         return `

//             <h2>
//                 Recommended Routine
//             </h2>

//             <p>
//                 🧴 Gentle cleanser
//             </p>

//             <p>
//                 💧 Lightweight,
//                 non-comedogenic moisturizer
//             </p>

//             <p>
//                 ☀️ Broad-spectrum sunscreen
//             </p>

//         `;

//     }


//     if (concern ===
//         "Pigmentation") {

//         return `

//             <h2>
//                 Recommended Routine
//             </h2>

//             <p>
//                 🧴 Gentle cleanser
//             </p>

//             <p>
//                 ✨ Brightening serum
//             </p>

//             <p>
//                 💧 Hydrating moisturizer
//             </p>

//             <p>
//                 ☀️ Broad-spectrum sunscreen
//             </p>

//         `;

//     }


//     if (concern ===
//         "Redness") {

//         return `

//             <h2>
//                 Recommended Routine
//             </h2>

//             <p>
//                 🧴 Gentle cleanser
//             </p>

//             <p>
//                 💧 Soothing moisturizer
//             </p>

//             <p>
//                 ☀️ Sunscreen
//             </p>

//         `;

//     }


//     return `

//         <h2>
//             Recommended Routine
//         </h2>

//         <p>
//             🧴 Gentle cleanser
//         </p>

//         <p>
//             💧 Moisturizer
//         </p>

//         <p>
//             ☀️ Daily sunscreen
//         </p>

//     `;
// }

function getRecommendation(concern) {

    const products = {

        "Acne / Blemishes": {

            title: "✨ Your Personalized Acne Routine",

            description:
                "AURA AI detected visible features associated with acne or blemishes. Here are some cosmetic skincare options to consider for a simple, consistent routine.",

            products: [

                {
                    category: "CLEANSER",
                    name: "Cetaphil Gentle Skin Cleanser",
                    description:
                        "A gentle daily cleanser that removes dirt and excess oil without leaving the skin feeling stripped.",
                    price: "₹431",
                    rating: "⭐ 4.6 (12K)",
                    image:
                        "https://placehold.co/500x350/f8ddd7/6b4035?text=Cetaphil+Cleanser",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                },

                {
                    category: "TREATMENT",
                    name: "Minimalist 2% Salicylic Acid Serum",
                    description:
                        "A lightweight skincare serum commonly used in routines for blemish-prone skin.",
                    price: "₹549",
                    rating: "⭐ 4.5 (8K)",
                    image:
                        "https://placehold.co/500x350/f4d8d2/6b4035?text=Salicylic+Serum",
                    button: "View on Amazon ↗",
                    link: "https://www.amazon.in/"
                },

                {
                    category: "MOISTURIZER",
                    name: "Cetaphil Moisturising Cream",
                    description:
                        "Helps maintain hydrated and comfortable-looking skin while keeping the routine simple.",
                    price: "₹584",
                    rating: "⭐ 4.7 (15K)",
                    image:
                        "https://placehold.co/500x350/f7e2dc/6b4035?text=Moisturizer",
                    button: "View on PharmEasy ↗",
                    link: "https://pharmeasy.in/"
                },

                {
                    category: "SUNSCREEN",
                    name: "Minimalist SPF 50 PA++++ Sunscreen",
                    description:
                        "Daily broad-spectrum sunscreen for everyday UV protection.",
                    price: "₹379",
                    rating: "⭐ 4.5 (20K)",
                    image:
                        "https://placehold.co/500x350/f5ddd2/6b4035?text=SPF+50",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                }

            ],

            routine:
                "Cleanser → Treatment → Moisturizer → Sunscreen"
        },


        "Pigmentation": {

            title: "✨ Your Personalized Pigmentation Routine",

            description:
                "AURA AI detected visible features associated with pigmentation. These cosmetic skincare options can help you build a simple brightening and protection-focused routine.",

            products: [

                {
                    category: "SERUM",
                    name: "Eucerin Anti-Pigment Dual Serum",
                    description:
                        "A targeted cosmetic serum formulated for the appearance of dark spots and uneven-looking skin tone.",
                    price: "₹3,000+",
                    rating: "⭐ 4.5",
                    image:
                        "https://placehold.co/500x350/f4dcd4/6b4035?text=Eucerin+Serum",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                },

                {
                    category: "BRIGHTENING",
                    name: "POND'S Bright Beauty Serum",
                    description:
                        "A lightweight brightening serum designed for a more even-looking complexion.",
                    price: "₹500+",
                    rating: "⭐ 4.4",
                    image:
                        "https://placehold.co/500x350/f7ded8/6b4035?text=Ponds+Serum",
                    button: "View Product ↗",
                    link: "https://www.amazon.in/"
                },

                {
                    category: "MOISTURIZER",
                    name: "Cetaphil Moisturising Cream",
                    description:
                        "Simple daily hydration to support a comfortable skincare routine.",
                    price: "₹584",
                    rating: "⭐ 4.7 (15K)",
                    image:
                        "https://placehold.co/500x350/f6e1db/6b4035?text=Moisturizer",
                    button: "View on PharmEasy ↗",
                    link: "https://pharmeasy.in/"
                },

                {
                    category: "SUNSCREEN",
                    name: "SPF 50+ Broad Spectrum Sunscreen",
                    description:
                        "Daily sun protection is an important part of maintaining an even-looking complexion.",
                    price: "₹379+",
                    rating: "⭐ 4.5",
                    image:
                        "https://placehold.co/500x350/f4ded5/6b4035?text=SPF+50",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                }

            ],

            routine:
                "Cleanser → Brightening Serum → Moisturizer → Sunscreen"
        },


        "Redness": {

            title: "✨ Your Personalized Redness Routine",

            description:
                "AURA AI detected visible features associated with redness. A simple, gentle routine may help maintain comfortable-looking skin.",

            products: [

                {
                    category: "CLEANSER",
                    name: "Cetaphil Gentle Skin Cleanser",
                    description:
                        "A mild cleanser suitable for a simple everyday skincare routine.",
                    price: "₹431",
                    rating: "⭐ 4.6 (12K)",
                    image:
                        "https://placehold.co/500x350/f7dfd9/6b4035?text=Gentle+Cleanser",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                },

                {
                    category: "MOISTURIZER",
                    name: "Cetaphil Moisturising Cream",
                    description:
                        "Rich hydration designed to help maintain comfortable, moisturized-looking skin.",
                    price: "₹584",
                    rating: "⭐ 4.7 (15K)",
                    image:
                        "https://placehold.co/500x350/f6e0da/6b4035?text=Moisturizer",
                    button: "View on PharmEasy ↗",
                    link: "https://pharmeasy.in/"
                },

                {
                    category: "SUNSCREEN",
                    name: "Minimalist SPF 50 PA++++ Sunscreen",
                    description:
                        "Daily broad-spectrum protection for your skincare routine.",
                    price: "₹379",
                    rating: "⭐ 4.5 (20K)",
                    image:
                        "https://placehold.co/500x350/f4ddd5/6b4035?text=SPF+50",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                }

            ],

            routine:
                "Gentle Cleanser → Moisturizer → Sunscreen"
        },


        "Clear Skin": {

            title: "✨ Maintain Your Skin Routine",

            description:
                "AURA AI did not detect a strong visual concern. A simple maintenance routine may be appropriate.",

            products: [

                {
                    category: "MOISTURIZER",
                    name: "Cetaphil Moisturising Lotion",
                    description:
                        "Everyday hydration for a simple skincare routine.",
                    price: "₹471",
                    rating: "⭐ 4.6",
                    image:
                        "https://placehold.co/500x350/f7e2dc/6b4035?text=Cetaphil+Lotion",
                    button: "View on PharmEasy ↗",
                    link: "https://pharmeasy.in/"
                },

                {
                    category: "SUNSCREEN",
                    name: "Minimalist SPF 50 PA++++ Sunscreen",
                    description:
                        "Daily broad-spectrum sunscreen for everyday protection.",
                    price: "₹379",
                    rating: "⭐ 4.5",
                    image:
                        "https://placehold.co/500x350/f5ded5/6b4035?text=SPF+50",
                    button: "View on Nykaa ↗",
                    link: "https://www.nykaa.com/"
                }

            ],

            routine:
                "Cleanser → Moisturizer → Sunscreen"
        }

    };


    // ---------------------------------------
    // Find the correct recommendation
    // ---------------------------------------

    const data = products[concern] || products["Clear Skin"];


    // ---------------------------------------
    // Product cards
    // ---------------------------------------

    const productCards = data.products.map(product => {

        return `

            <div class="product-card">

                <div class="product-image">

                    <img
                        src="${product.image}"
                        alt="${product.name}"
                        loading="lazy"
                    >

                </div>


                <span class="product-badge">
                    ${product.category}
                </span>


                <h3>
                    ${product.name}
                </h3>


                <p>
                    ${product.description}
                </p>


                <div class="product-meta">

                    <strong>
                        ${product.price}
                    </strong>

                    <span>
                        ${product.rating}
                    </span>

                </div>


                <a
                    href="${product.link}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="product-btn">

                    ${product.button}

                </a>

            </div>

        `;

    }).join("");


    // ---------------------------------------
    // Return beautiful recommendation section
    // ---------------------------------------

    return `

        <section class="recommendation-card">

            <div class="recommendation-heading">

                <span class="section-icon">
                    🛍️
                </span>

                <div>

                    <h2>
                        ${data.title}
                    </h2>

                    <p>
                        ${data.description}
                    </p>

                </div>

            </div>


            <div class="products-grid">

                ${productCards}

            </div>


            <div class="routine-box">

                <div class="routine-icon">
                    ✨
                </div>

                <div>

                    <strong>
                        Suggested Routine
                    </strong>

                    <p>
                        ${data.routine}
                    </p>

                </div>

            </div>


            <p class="ai-disclaimer">
                AURA AI provides cosmetic and wellness recommendations
                based on visible image features. This is not a medical diagnosis.
            </p>

        </section>

    `;
}


// ==============================
// START
// ==============================

loadModel();