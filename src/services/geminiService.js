// Gemini AI Service for Report Compilation and Analysis
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyDDL3nl6cR3xsIQ8Ilv046_7xjIa-iIo0E';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/**
 * Analyze multiple community reports and compile them into a single executive summary
 * @param {Array} reports - Array of report objects with text, location, images, etc.
 * @returns {Object} Compiled report with severity, confidence, summary, and images
 */
export const compileReports = async (reports) => {
  try {
    if (!reports || reports.length === 0) {
      throw new Error('No reports provided');
    }

    // Prepare the prompt for Gemini
    const reportsText = reports.map((report, index) => {
      return `
Report ${index + 1}:
Location: ${report.location || 'Unknown'}
Time: ${report.timestamp || 'Unknown'}
Type: ${report.type || 'General'}
Description: ${report.description || report.text || ''}
Reporter: ${report.reporterName || 'Anonymous'}
${report.images && report.images.length > 0 ? `Images: ${report.images.length} attached` : 'No images'}
---`;
    }).join('\n');

    const prompt = `You are an AI assistant helping the Local Government Unit (LGU) analyze weather-related community reports for class suspension decisions.

Analyze these ${reports.length} community reports and provide:

1. **Severity Level**: Classify as "critical", "high", "medium", or "low"
   - Critical: Immediate danger, flooding, impassable roads, severe storm
   - High: Heavy rain, strong winds, potential flooding, safety concerns
   - Medium: Moderate weather conditions, some disruption
   - Low: Light rain, minor issues

2. **Confidence Score**: Percentage (0-100%) based on:
   - Number of reports from the same location
   - Consistency of descriptions
   - Severity of reported conditions

3. **Compiled Summary**: Create a concise, professional summary (100-150 words) that:
   - Highlights the main weather issue
   - Mentions the affected location(s)
   - Notes the number of sources/reports
   - Describes the impact (road conditions, flooding, etc.)
   - Is written for government officials to make quick decisions

4. **Key Points**: List 3-5 bullet points of the most critical information

5. **Recommendation**: Brief recommendation for the LGU (e.g., "Recommend class suspension", "Monitor situation", "No action needed")

Reports to analyze:
${reportsText}

Respond in JSON format:
{
  "severity": "critical|high|medium|low",
  "confidence": 85,
  "summary": "Your compiled summary here...",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "recommendation": "Your recommendation",
  "location": "Primary affected location",
  "sources": ${reports.length}
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates[0].content.parts[0].text;

    // Parse JSON response from AI
    let compiledData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      compiledData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback parsing
      compiledData = {
        severity: 'medium',
        confidence: 70,
        summary: aiResponse,
        keyPoints: ['Manual review recommended'],
        recommendation: 'Review reports manually',
        location: reports[0]?.location || 'Unknown',
        sources: reports.length
      };
    }

    // Collect all images from reports
    const allImages = reports.reduce((images, report) => {
      if (report.images && Array.isArray(report.images)) {
        return [...images, ...report.images];
      }
      return images;
    }, []);

    // Return compiled report
    return {
      id: `compiled_${Date.now()}`,
      severity: compiledData.severity,
      confidence: compiledData.confidence,
      summary: compiledData.summary,
      keyPoints: compiledData.keyPoints || [],
      recommendation: compiledData.recommendation,
      location: compiledData.location,
      sources: reports.length,
      images: allImages.slice(0, 10), // Limit to 10 images
      timestamp: new Date().toISOString(),
      originalReports: reports.map(r => ({
        id: r.id,
        location: r.location,
        timestamp: r.timestamp
      })),
      verified: true,
      compressed: `Compressed from ${reports.reduce((total, r) => total + (r.description?.split(' ').length || 0), 0)} words`
    };

  } catch (error) {
    console.error('Error compiling reports with Gemini:', error);
    throw error;
  }
};

/**
 * Analyze a single report with images for severity and authenticity
 * Uses current weather data to verify credibility
 * @param {Object} report - Single report with text and images
 * @param {Object} weatherData - Current weather data from OpenWeather API
 * @returns {Object} Analysis results
 */
export const analyzeReportWithImages = async (report, weatherData = null) => {
  try {
    const weatherInfo = weatherData ? `

CURRENT WEATHER DATA FOR ${weatherData.location?.city || 'the location'}:
- Temperature: ${weatherData.current?.temperature || 'N/A'}°C
- Weather Condition: ${weatherData.current?.weather?.description || 'N/A'}
- Rainfall: ${weatherData.current?.rainfall || 0}mm/h
- Wind Speed: ${weatherData.current?.windSpeed || 'N/A'} km/h
- Humidity: ${weatherData.current?.humidity || 'N/A'}%
- Cloudiness: ${weatherData.current?.cloudiness || 'N/A'}%

IMPORTANT: Compare the user's report with the actual weather data above. If they claim severe weather (storm, heavy rain, flooding, strong winds) but the weather data shows calm/clear conditions, mark it as NOT CREDIBLE.` : '';

    const parts = [{
      text: `Analyze this weather-related report and determine:
1. Severity level (critical/high/medium/low)
2. Credibility based on actual weather data (0-100%)
3. Brief assessment (2-3 sentences)
4. Whether the report is credible based on current weather

Report Details:
Location: ${report.location}
Description: ${report.description}
Type: ${report.type}${weatherInfo}

CREDIBILITY RULES:
- If report claims "storm/typhoon" but wind is <30km/h and rain is <5mm/h: LOW credibility (<40%)
- If report claims "flooding/heavy rain" but rainfall is 0mm/h and weather is clear: LOW credibility (<30%)
- If report claims "strong winds" but wind speed is <20km/h: LOW credibility (<35%)
- If weather data supports the report: HIGH credibility (>75%)

Respond in JSON:
{
  "severity": "critical/high/medium/low",
  "confidence": 85,
  "assessment": "your assessment explaining if weather data supports the report",
  "isAuthentic": true/false,
  "isCredible": true/false,
  "credibilityReason": "explanation why credible or not based on weather data"
}`
    }];

    // Add images if available
    if (report.images && report.images.length > 0) {
      for (const imageUrl of report.images.slice(0, 3)) { // Limit to 3 images
        try {
          // Fetch image and convert to base64
          const imageResponse = await fetch(imageUrl);
          const blob = await imageResponse.blob();
          const base64 = await blobToBase64(blob);

          parts.push({
            inlineData: {
              mimeType: blob.type,
              data: base64.split(',')[1] // Remove data:image/xxx;base64, prefix
            }
          });
        } catch (imgError) {
          console.error('Error processing image:', imgError);
        }
      }
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          topK: 32,
          topP: 1,
          maxOutputTokens: 512,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates[0].content.parts[0].text;

    // Parse JSON response
    const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
    const analysis = JSON.parse(jsonText);

    return {
      severity: analysis.severity || 'medium',
      confidence: analysis.confidence || 50,
      assessment: analysis.assessment || 'Report analyzed',
      isAuthentic: analysis.isAuthentic !== false,
      isCredible: analysis.isCredible !== false,
      credibilityReason: analysis.credibilityReason || analysis.assessment
    };

  } catch (error) {
    console.error('Error analyzing report with images:', error);
    return {
      severity: 'medium',
      confidence: 50,
      assessment: 'Unable to analyze report',
      isAuthentic: true,
      isCredible: true,
      credibilityReason: 'Analysis unavailable - manual review required'
    };
  }
};

/**
 * Helper function to convert blob to base64
 */
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Group reports by location and time proximity
 * @param {Array} reports - All reports
 * @param {number} timeWindowMinutes - Time window in minutes to group reports
 * @returns {Array} Grouped reports
 */
export const groupReportsByLocationAndTime = (reports, timeWindowMinutes = 60) => {
  const groups = {};

  reports.forEach(report => {
    const location = report.location || 'Unknown';
    const timestamp = new Date(report.timestamp || Date.now());

    // Find existing group for this location within time window
    let groupKey = null;
    for (const key in groups) {
      const [groupLocation, groupTime] = key.split('_');
      if (groupLocation === location) {
        const timeDiff = Math.abs(timestamp - new Date(parseInt(groupTime))) / 1000 / 60;
        if (timeDiff <= timeWindowMinutes) {
          groupKey = key;
          break;
        }
      }
    }

    // Create new group if not found
    if (!groupKey) {
      groupKey = `${location}_${timestamp.getTime()}`;
      groups[groupKey] = [];
    }

    groups[groupKey].push(report);
  });

  return Object.values(groups);
};

/**
 * Get severity badge color
 */
export const getSeverityColor = (severity) => {
  const colors = {
    critical: { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
    high: { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' },
    medium: { bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' },
    low: { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500' },
  };
  return colors[severity] || colors.medium;
};

/**
 * Analyze community reports for class suspension advisory
 * @param {Array} reports - Array of community reports
 * @returns {Promise<Object>} Analysis with priority classification
 */
export const analyzeClassSuspensionReports = async (reports) => {
  if (!GEMINI_API_KEY) {
    console.warn('Gemini API key not configured. Using fallback analysis.');
    return fallbackClassSuspensionAnalysis(reports);
  }

  try {
    const reportsText = reports.slice(0, 50).map((report, index) => {
      return `${index + 1}. Location: ${report.location?.city || 'Unknown'}, ${report.location?.barangay || ''}
   Category: ${report.category || 'general'}
   Description: ${report.description || 'No description'}
   Severity: ${report.severity || 'unknown'}
   Time: ${report.createdAt ? new Date(report.createdAt.seconds * 1000).toLocaleString() : 'Unknown'}`;
    }).join('\n\n');

    const prompt = `You are an AI assistant for Batangas Province disaster management system in the Philippines.
Analyze these community disaster reports and classify them by priority for class suspension decisions.

Instructions:
1. Classify each report as: Critical (immediate danger), Medium (monitor closely), or Low (normal conditions)
2. Identify patterns across locations (flooding, landslides, strong winds, etc.)
3. Count critical reports per city/municipality
4. Provide overall risk assessment
5. Recommend whether class suspension should be considered

Reports (${reports.length} total):
${reportsText}

Respond in JSON format:
{
  "summary": "Brief summary of overall situation",
  "totalReports": ${reports.length},
  "criticalCount": 0,
  "mediumCount": 0,
  "lowCount": 0,
  "affectedAreas": ["City1", "City2"],
  "mainThreats": ["flooding", "strong winds"],
  "priority": "Critical|Medium|Low",
  "recommendation": "Detailed recommendation for LGUs and schools",
  "suspensionAdvised": true|false,
  "reportsByLocation": {
    "CityName": {
      "critical": 0,
      "medium": 0,
      "low": 0,
      "mainIssues": ["flooding"]
    }
  }
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      throw new Error('No response from Gemini AI');
    }

    // Extract JSON from response
    let jsonText = aiResponse;
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
                      aiResponse.match(/```\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const analysis = JSON.parse(jsonText.trim());

    return {
      success: true,
      analysis,
      rawResponse: aiResponse,
      source: 'gemini'
    };

  } catch (error) {
    console.error('Gemini AI class suspension analysis failed:', error);
    return fallbackClassSuspensionAnalysis(reports);
  }
};

/**
 * Analyze combined weather data and reports for suspension advisory
 * @param {Array} weatherData - Weather data for cities
 * @param {Array} reports - Community reports
 * @returns {Promise<Object>} Combined suspension analysis
 */
export const analyzeSuspensionAdvisory = async (weatherData, reports) => {
  if (!GEMINI_API_KEY) {
    console.warn('Gemini API key not configured. Using fallback suspension advisory.');
    return fallbackSuspensionAdvisory(weatherData, reports);
  }

  try {
    const weatherSummary = weatherData.map(city => {
      return `${city.location.city}: ${city.current.temperature}°C, ${city.current.description}
Rainfall: ${city.current.rainfall}mm/h, Wind: ${city.current.windSpeed} km/h, Humidity: ${city.current.humidity}%`;
    }).join('\n');

    const recentReports = reports.slice(0, 20).map((r, i) => {
      return `${i + 1}. [${r.category || 'general'}] ${r.location?.city || 'Unknown'}: ${r.description} (Severity: ${r.severity || 'unknown'})`;
    }).join('\n');

    const prompt = `You are a disaster management AI for Batangas Province, Philippines.
Analyze weather conditions and community reports to determine if class suspension should be recommended.

WEATHER DATA (OpenWeather API - ${weatherData.length} cities):
${weatherSummary}

COMMUNITY REPORTS (${reports.length} total, showing most recent):
${recentReports}

CRITERIA FOR CLASS SUSPENSION:
- Heavy rainfall (>20mm/h) OR Strong winds (>60km/h)
- Multiple flooding reports in school areas
- Landslides or infrastructure damage near schools
- Critical severity reports affecting transport routes
- Temperature extremes (>38°C)

Provide analysis in JSON format:
{
  "overallRisk": "Critical|High|Moderate|Low",
  "suspensionRecommended": true|false,
  "affectedCities": ["City1", "City2"],
  "riskFactors": ["heavy rainfall in Lipa", "5 flooding reports"],
  "weatherScore": 0-100,
  "reportsScore": 0-100,
  "combinedScore": 0-100,
  "advisory": "Detailed advisory message for LGUs, schools, and parents",
  "priorityActions": ["Issue immediate suspension", "Alert affected schools"],
  "expectedConditions": "Description of expected conditions in next 6-12 hours",
  "timestamp": "${new Date().toISOString()}"
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // Extract JSON
    let jsonText = aiResponse;
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
                      aiResponse.match(/```\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const analysis = JSON.parse(jsonText.trim());

    return {
      success: true,
      analysis,
      source: 'gemini'
    };

  } catch (error) {
    console.error('Suspension advisory analysis failed:', error);
    return fallbackSuspensionAdvisory(weatherData, reports);
  }
};

/**
 * Fallback analysis for class suspension (when Gemini unavailable)
 */
const fallbackClassSuspensionAnalysis = (reports) => {
  const analysis = {
    summary: '',
    totalReports: reports.length,
    criticalCount: 0,
    mediumCount: 0,
    lowCount: 0,
    affectedAreas: new Set(),
    mainThreats: new Set(),
    priority: 'Low',
    recommendation: '',
    suspensionAdvised: false,
    reportsByLocation: {}
  };

  const criticalKeywords = ['flood', 'landslide', 'strong wind', 'typhoon', 'severe', 'emergency', 'impassable', 'evacuation', 'danger'];
  const mediumKeywords = ['rain', 'wind', 'weather', 'storm', 'warning', 'alert', 'slippery'];

  reports.forEach(report => {
    const text = `${report.description || ''} ${report.category || ''}`.toLowerCase();
    const city = report.location?.city || 'Unknown';

    analysis.affectedAreas.add(city);

    if (!analysis.reportsByLocation[city]) {
      analysis.reportsByLocation[city] = { critical: 0, medium: 0, low: 0, mainIssues: [] };
    }

    let isCritical = false;
    let isMedium = false;

    // Check severity field
    if (report.severity === 'critical' || report.severity === 'high') {
      isCritical = true;
    } else {
      // Check keywords
      for (const keyword of criticalKeywords) {
        if (text.includes(keyword)) {
          isCritical = true;
          analysis.mainThreats.add(keyword);
          analysis.reportsByLocation[city].mainIssues.push(keyword);
          break;
        }
      }

      if (!isCritical) {
        for (const keyword of mediumKeywords) {
          if (text.includes(keyword)) {
            isMedium = true;
            break;
          }
        }
      }
    }

    if (isCritical) {
      analysis.criticalCount++;
      analysis.reportsByLocation[city].critical++;
    } else if (isMedium) {
      analysis.mediumCount++;
      analysis.reportsByLocation[city].medium++;
    } else {
      analysis.lowCount++;
      analysis.reportsByLocation[city].low++;
    }

    if (report.category) {
      analysis.mainThreats.add(report.category);
    }
  });

  // Determine priority
  if (analysis.criticalCount >= 5) {
    analysis.priority = 'Critical';
    analysis.suspensionAdvised = true;
  } else if (analysis.criticalCount >= 2 || analysis.mediumCount >= 10) {
    analysis.priority = 'Medium';
    analysis.suspensionAdvised = false;
  } else {
    analysis.priority = 'Low';
    analysis.suspensionAdvised = false;
  }

  analysis.affectedAreas = Array.from(analysis.affectedAreas);
  analysis.mainThreats = Array.from(analysis.mainThreats);

  const threatsList = analysis.mainThreats.slice(0, 3).join(', ');
  analysis.summary = `${analysis.totalReports} community reports analyzed. ${analysis.criticalCount} critical alerts detected${threatsList ? ` involving ${threatsList}` : ''}.`;

  if (analysis.suspensionAdvised) {
    analysis.recommendation = `High priority: ${analysis.criticalCount} critical reports indicate dangerous conditions in ${analysis.affectedAreas.join(', ')}. Strongly recommend class suspension and public safety advisory.`;
  } else if (analysis.priority === 'Medium') {
    analysis.recommendation = `Monitor situation closely. ${analysis.mediumCount} moderate reports require attention. Prepare contingency plans and keep schools on alert.`;
  } else {
    analysis.recommendation = 'Situation under control. Continue routine monitoring. No class suspension necessary at this time.';
  }

  return {
    success: true,
    analysis,
    source: 'fallback'
  };
};

/**
 * Fallback suspension advisory (when Gemini unavailable)
 */
const fallbackSuspensionAdvisory = (weatherData, reports) => {
  let weatherScore = 0;
  let reportsScore = 0;
  const affectedCities = new Set();
  const riskFactors = [];

  // Analyze weather
  weatherData.forEach(city => {
    const { rainfall, windSpeed, temperature } = city.current;

    if (rainfall > 20) {
      weatherScore += 40;
      riskFactors.push(`Heavy rainfall in ${city.location.city} (${rainfall}mm/h)`);
      affectedCities.add(city.location.city);
    } else if (rainfall > 10) {
      weatherScore += 25;
      riskFactors.push(`Moderate rainfall in ${city.location.city}`);
    }

    if (windSpeed > 60) {
      weatherScore += 35;
      riskFactors.push(`Strong winds in ${city.location.city} (${windSpeed} km/h)`);
      affectedCities.add(city.location.city);
    } else if (windSpeed > 40) {
      weatherScore += 20;
    }

    if (temperature > 38) {
      weatherScore += 15;
      riskFactors.push(`Extreme heat in ${city.location.city} (${temperature}°C)`);
      affectedCities.add(city.location.city);
    }
  });

  // Analyze reports
  const criticalReports = reports.filter(r =>
    r.severity === 'critical' || r.severity === 'high'
  );

  reportsScore = Math.min(criticalReports.length * 10, 100);

  if (criticalReports.length >= 5) {
    riskFactors.push(`${criticalReports.length} critical community reports`);
    criticalReports.slice(0, 3).forEach(r => {
      if (r.location?.city) {
        affectedCities.add(r.location.city);
      }
    });
  }

  const combinedScore = Math.min((weatherScore + reportsScore) / 2, 100);

  let overallRisk = 'Low';
  let suspensionRecommended = false;

  if (combinedScore >= 70) {
    overallRisk = 'Critical';
    suspensionRecommended = true;
  } else if (combinedScore >= 50) {
    overallRisk = 'High';
    suspensionRecommended = true;
  } else if (combinedScore >= 30) {
    overallRisk = 'Moderate';
  }

  const affectedCitiesArray = Array.from(affectedCities);

  const advisory = suspensionRecommended
    ? `CLASS SUSPENSION RECOMMENDED for ${affectedCitiesArray.join(', ')}. Dangerous conditions detected: ${riskFactors.slice(0, 3).join('; ')}. Parents and guardians should keep children at home. Schools should prepare for extended closure if conditions worsen.`
    : `Monitor conditions closely. Risk level: ${overallRisk}. ${riskFactors.length > 0 ? 'Current concerns: ' + riskFactors.slice(0, 2).join('; ') + '.' : 'Weather conditions within normal parameters.'}`;

  const priorityActions = suspensionRecommended
    ? [
        'Issue immediate class suspension announcement',
        `Alert all schools in ${affectedCitiesArray.join(', ')}`,
        'Notify parents via SMS/social media',
        'Activate emergency response teams',
        'Monitor conditions for possible extension'
      ]
    : [
        'Continue active monitoring',
        'Prepare contingency plans',
        'Keep communication channels open',
        'Update every 2-3 hours'
      ];

  const expectedConditions = combinedScore >= 50
    ? 'Conditions expected to remain severe for the next 6-12 hours. Heavy rainfall and strong winds may continue. Roads may become impassable. Exercise extreme caution.'
    : combinedScore >= 30
    ? 'Moderate weather conditions expected to persist. Situation may improve or worsen depending on weather system movement. Stay updated with latest advisories.'
    : 'Weather conditions expected to remain stable or improve gradually. Normal activities can proceed with routine weather monitoring.';

  return {
    success: true,
    analysis: {
      overallRisk,
      suspensionRecommended,
      affectedCities: affectedCitiesArray,
      riskFactors,
      weatherScore: Math.round(weatherScore),
      reportsScore: Math.round(reportsScore),
      combinedScore: Math.round(combinedScore),
      advisory,
      priorityActions,
      expectedConditions,
      timestamp: new Date().toISOString()
    },
    source: 'fallback'
  };
};

/**
 * Analyze compiled reports by location for credibility and provide actionable summary
 * This function is specifically for the "Compiled Reports by Location" feature
 * @param {Object} locationData - Location group data with all reports
 * @returns {Promise<Object>} Comprehensive AI analysis with credibility, severity, patterns, and recommendations
 */
export const analyzeCompiledLocationReports = async (locationData) => {
  if (!GEMINI_API_KEY) {
    console.warn('Gemini API key not configured. Using fallback analysis.');
    return fallbackLocationAnalysis(locationData);
  }

  try {
    // Prepare reports data for AI analysis
    const reportsData = locationData.reports.map((report, index) => {
      const timestamp = report.createdAt?.seconds
        ? new Date(report.createdAt.seconds * 1000).toLocaleString()
        : report.createdAt?.toDate?.()?.toLocaleString() || 'Unknown';

      return `Report ${index + 1}:
  Severity: ${report.severity || 'unknown'}
  Category: ${report.category || 'general'}
  Status: ${report.status || 'pending'}
  Description: ${report.description || 'No description'}
  Reporter: ${report.userName || 'Anonymous'}
  Time: ${timestamp}
  Location: ${report.location?.barangay || ''}, ${report.location?.city || locationData.city}
  Has Images: ${report.images && report.images.length > 0 ? 'Yes (' + report.images.length + ')' : 'No'}`;
    }).join('\n\n');

    const prompt = `You are an AI assistant helping emergency management officials in Batangas Province, Philippines analyze compiled weather-related incident reports for a specific location.

LOCATION: ${locationData.city}
TOTAL REPORTS: ${locationData.totalReports}
CRITICAL REPORTS: ${locationData.criticalReports}
HIGH PRIORITY REPORTS: ${locationData.highReports}
MEDIUM PRIORITY REPORTS: ${locationData.mediumReports}
VERIFIED REPORTS: ${locationData.verifiedReports}
PENDING REPORTS: ${locationData.pendingReports}

ALL INDIVIDUAL REPORTS:
${reportsData}

Your task is to analyze ALL these reports comprehensively and provide:

1. **COMPILED SUMMARY**: A concise 3-4 sentence executive summary that compiles all reports into ONE coherent description of what's actually happening in ${locationData.city}. Don't just list reports - synthesize them into a single narrative.

2. **CREDIBILITY SCORE (0-100)**: Assess how credible these reports are based on:
   - Consistency between reports (do they corroborate each other?)
   - Quality of descriptions (specific details vs vague claims)
   - Verification status
   - Presence of evidence (images)
   - Potential duplicates or fake reports
   - Contradictory information

3. **ACTUAL SEVERITY**: Based on ALL reports combined, determine the real threat level (CRITICAL, HIGH, MEDIUM, or LOW)

4. **PATTERN DETECTION**: Identify:
   - Timeline of events (when did incidents start/peak?)
   - Common themes across reports
   - Geographic patterns within the location
   - Correlations between different report types

5. **INCONSISTENCIES**: Flag any suspicious, contradictory, or potentially fake reports

6. **ACTIONABLE RECOMMENDATIONS**: What should the admin DO with this information?

Respond in JSON format ONLY (no markdown, no extra text):
{
  "compiledSummary": "Your 3-4 sentence compiled narrative of the situation",
  "credibilityScore": 75,
  "credibilityAssessment": "Detailed explanation of the credibility score with specific evidence",
  "actualSeverity": "CRITICAL|HIGH|MEDIUM|LOW",
  "severityReasoning": "Why you assigned this severity level based on all reports",
  "patterns": [
    "Specific pattern 1 with details",
    "Specific pattern 2 with details",
    "Timeline or geographic pattern"
  ],
  "inconsistencies": [
    "Specific inconsistency or red flag",
    "Potential duplicate or fake report"
  ],
  "keyFindings": [
    "Most important finding 1",
    "Most important finding 2",
    "Critical insight 3"
  ],
  "recommendations": [
    "Immediate action 1",
    "Investigation step 2",
    "Communication recommendation 3"
  ],
  "affectedAreas": ["Specific barangay 1", "Specific barangay 2"],
  "estimatedImpact": "Brief description of estimated impact on residents and infrastructure",
  "urgencyLevel": "IMMEDIATE|HIGH|MODERATE|LOW"
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      throw new Error('No response from Gemini AI');
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = aiResponse;
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
                      aiResponse.match(/```\s*([\s\S]*?)\s*```/) ||
                      aiResponse.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      jsonText = jsonMatch[1] || jsonMatch[0];
    }

    const analysis = JSON.parse(jsonText.trim());

    // Validate and normalize the response
    return {
      success: true,
      analysis: {
        compiledSummary: analysis.compiledSummary || "Unable to generate summary",
        credibilityScore: Math.min(100, Math.max(0, analysis.credibilityScore || 50)),
        credibilityAssessment: analysis.credibilityAssessment || "No assessment available",
        actualSeverity: analysis.actualSeverity || "MEDIUM",
        severityReasoning: analysis.severityReasoning || "No reasoning available",
        patterns: Array.isArray(analysis.patterns) ? analysis.patterns : [],
        inconsistencies: Array.isArray(analysis.inconsistencies) ? analysis.inconsistencies : [],
        keyFindings: Array.isArray(analysis.keyFindings) ? analysis.keyFindings : [],
        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
        affectedAreas: Array.isArray(analysis.affectedAreas) ? analysis.affectedAreas : [],
        estimatedImpact: analysis.estimatedImpact || "Impact assessment unavailable",
        urgencyLevel: analysis.urgencyLevel || "MODERATE"
      },
      timestamp: new Date().toISOString(),
      source: 'gemini'
    };

  } catch (error) {
    console.error('Gemini AI location analysis error:', error);
    return fallbackLocationAnalysis(locationData);
  }
};

/**
 * Fallback analysis when Gemini API is unavailable
 */
const fallbackLocationAnalysis = (locationData) => {
  const reports = locationData.reports || [];

  // Calculate basic credibility score
  let credibilityScore = 50;
  if (locationData.verifiedReports > locationData.totalReports * 0.5) credibilityScore += 20;
  if (locationData.totalReports >= 5) credibilityScore += 15;
  if (reports.some(r => r.images?.length > 0)) credibilityScore += 10;

  // Determine severity
  let actualSeverity = 'LOW';
  if (locationData.criticalReports >= 3) actualSeverity = 'CRITICAL';
  else if (locationData.criticalReports >= 1 || locationData.highReports >= 3) actualSeverity = 'HIGH';
  else if (locationData.highReports >= 1 || locationData.mediumReports >= 2) actualSeverity = 'MEDIUM';

  // Extract patterns
  const categories = {};
  reports.forEach(r => {
    const cat = r.category || 'general';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  const topCategories = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${cat} (${count} reports)`);

  return {
    success: true,
    analysis: {
      compiledSummary: `${locationData.city} has received ${locationData.totalReports} incident reports, with ${locationData.criticalReports} marked as critical. The situation requires ${actualSeverity.toLowerCase()} priority attention based on the volume and severity of reported incidents.`,
      credibilityScore: Math.min(100, credibilityScore),
      credibilityAssessment: `Based on ${locationData.verifiedReports} verified reports out of ${locationData.totalReports} total reports. Credibility assessment uses basic heuristics.`,
      actualSeverity,
      severityReasoning: `Severity determined by ${locationData.criticalReports} critical and ${locationData.highReports} high-priority reports.`,
      patterns: topCategories.length > 0 ? [`Primary incident types: ${topCategories.join(', ')}`] : ['Insufficient data for pattern detection'],
      inconsistencies: locationData.pendingReports > locationData.verifiedReports * 2 ? ['High number of unverified reports - manual review recommended'] : [],
      keyFindings: [
        `${locationData.totalReports} total reports received`,
        `${locationData.criticalReports} critical severity incidents`,
        `${Math.round((locationData.verifiedReports / locationData.totalReports) * 100)}% verification rate`
      ],
      recommendations: [
        actualSeverity === 'CRITICAL' ? 'Immediate response required - dispatch emergency teams' : 'Monitor situation closely',
        locationData.pendingReports > 0 ? `Verify ${locationData.pendingReports} pending reports` : 'Continue standard verification procedures',
        'Use AI-powered analysis for more detailed insights'
      ],
      affectedAreas: [locationData.city],
      estimatedImpact: `Potentially affecting multiple areas within ${locationData.city}`,
      urgencyLevel: actualSeverity === 'CRITICAL' ? 'IMMEDIATE' : actualSeverity === 'HIGH' ? 'HIGH' : 'MODERATE'
    },
    timestamp: new Date().toISOString(),
    source: 'fallback'
  };
};

/**
 * Analyze individual report credibility by comparing with other reports from the same city
 * Detects spam, fake reports, duplicates
 * @param {Object} report - Single report to analyze
 * @param {Array} otherReportsFromCity - All other reports from the same city
 * @returns {Promise<Object>} Credibility analysis with spam detection
 */
export const analyzeIndividualReportCredibility = async (report, otherReportsFromCity) => {
  if (!GEMINI_API_KEY) {
    return fallbackIndividualCredibility(report, otherReportsFromCity);
  }

  try {
    // Prepare other reports for comparison
    const otherReportsText = otherReportsFromCity
      .filter(r => r.id !== report.id) // Exclude the report being analyzed
      .slice(0, 10) // Limit to 10 reports for context
      .map((r, idx) => {
        const timestamp = r.createdAt?.seconds
          ? new Date(r.createdAt.seconds * 1000).toLocaleString()
          : r.createdAt?.toDate?.()?.toLocaleString() || 'Unknown';

        return `Report ${idx + 1}:
  Category: ${r.category || 'general'}
  Severity: ${r.severity || 'unknown'}
  Description: ${r.description || 'No description'}
  Time: ${timestamp}
  Has Images: ${r.images?.length > 0 ? 'Yes' : 'No'}`;
      }).join('\n\n');

    const reportTimestamp = report.createdAt?.seconds
      ? new Date(report.createdAt.seconds * 1000).toLocaleString()
      : report.createdAt?.toDate?.()?.toLocaleString() || 'Unknown';

    const prompt = `You are an AI assistant helping detect spam and fake weather incident reports for ${report.location?.city || 'a city'} in Batangas Province, Philippines.

REPORT TO ANALYZE:
Category: ${report.category || 'general'}
Severity: ${report.severity || 'unknown'}
Description: ${report.description || 'No description'}
Reporter: ${report.userName || 'Anonymous'}
Time: ${reportTimestamp}
Location: ${report.location?.barangay || ''}, ${report.location?.city || 'Unknown'}
Has Images: ${report.images?.length > 0 ? 'Yes (' + report.images.length + ')' : 'No'}
Status: ${report.status || 'pending'}

OTHER REPORTS FROM THE SAME CITY (for comparison):
${otherReportsText || 'No other reports to compare'}

Your task is to determine if this report is CREDIBLE or SPAM by analyzing:

1. **CONSISTENCY**: Does it align with other reports from the same location/time?
2. **SPECIFICITY**: Does it have specific details or just vague claims?
3. **PLAUSIBILITY**: Does the description make sense for the stated severity?
4. **EVIDENCE**: Does it have images to support the claim?
5. **DUPLICATES**: Is this a duplicate or copy of another report?
6. **RED FLAGS**: Generic descriptions, impossible claims, contradictions with other reports

SPAM INDICATORS:
- Vague, generic descriptions like "bad weather" without specifics
- Severity doesn't match description (e.g., "critical" but only mentions light rain)
- Contradicts all other reports (everyone says sunny, this says flooding)
- Duplicate text from another report
- Impossible or exaggerated claims
- No evidence (images) for severe claims

CREDIBLE INDICATORS:
- Specific details (street names, measurements, time of events)
- Consistent with other reports from same area/time
- Has supporting images
- Severity matches description
- Reasonable and plausible claims

Respond in JSON format ONLY:
{
  "isSpam": true|false,
  "credibilityScore": 0-100,
  "spamReason": "Specific explanation of why this is spam or credible",
  "category": "CREDIBLE|LIKELY_CREDIBLE|SUSPICIOUS|LIKELY_SPAM|SPAM",
  "redFlags": ["specific red flag 1", "specific red flag 2"],
  "supportingFactors": ["factor that supports credibility"],
  "recommendation": "APPROVE|REVIEW_MANUALLY|REJECT"
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 512,
        },
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      throw new Error('No response from Gemini AI');
    }

    // Extract JSON
    let jsonText = aiResponse;
    const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
                      aiResponse.match(/```\s*([\s\S]*?)\s*```/) ||
                      aiResponse.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      jsonText = jsonMatch[1] || jsonMatch[0];
    }

    const analysis = JSON.parse(jsonText.trim());

    return {
      success: true,
      isSpam: analysis.isSpam || false,
      credibilityScore: Math.min(100, Math.max(0, analysis.credibilityScore || 50)),
      spamReason: analysis.spamReason || "Analysis unavailable",
      category: analysis.category || "SUSPICIOUS",
      redFlags: Array.isArray(analysis.redFlags) ? analysis.redFlags : [],
      supportingFactors: Array.isArray(analysis.supportingFactors) ? analysis.supportingFactors : [],
      recommendation: analysis.recommendation || "REVIEW_MANUALLY",
      source: 'gemini'
    };

  } catch (error) {
    console.error('Individual report credibility analysis error:', error);
    return fallbackIndividualCredibility(report, otherReportsFromCity);
  }
};

/**
 * Fallback credibility check for individual reports
 */
const fallbackIndividualCredibility = (report, otherReportsFromCity) => {
  let credibilityScore = 50;
  const redFlags = [];
  const supportingFactors = [];

  // Check for evidence
  if (report.images && report.images.length > 0) {
    credibilityScore += 25;
    supportingFactors.push('Has supporting images');
  } else if (report.severity === 'critical' || report.severity === 'high') {
    redFlags.push('High severity claim without images');
    credibilityScore -= 15;
  }

  // Check description length and specificity
  const descLength = (report.description || '').length;
  if (descLength < 20) {
    redFlags.push('Very short description');
    credibilityScore -= 20;
  } else if (descLength > 50) {
    supportingFactors.push('Detailed description');
    credibilityScore += 10;
  }

  // Check if verified
  if (report.status === 'verified') {
    credibilityScore += 20;
    supportingFactors.push('Verified by admin');
  }

  // Check consistency with other reports
  const similarReports = otherReportsFromCity.filter(r =>
    r.category === report.category &&
    Math.abs((r.createdAt?.seconds || 0) - (report.createdAt?.seconds || 0)) < 3600
  );

  if (similarReports.length >= 2) {
    supportingFactors.push(`${similarReports.length} similar reports nearby`);
    credibilityScore += 15;
  } else if (otherReportsFromCity.length > 5 && similarReports.length === 0) {
    redFlags.push('No corroborating reports');
    credibilityScore -= 10;
  }

  credibilityScore = Math.min(100, Math.max(0, credibilityScore));

  let category = 'SUSPICIOUS';
  if (credibilityScore >= 80) category = 'CREDIBLE';
  else if (credibilityScore >= 60) category = 'LIKELY_CREDIBLE';
  else if (credibilityScore <= 30) category = 'SPAM';
  else if (credibilityScore <= 50) category = 'LIKELY_SPAM';

  return {
    success: true,
    isSpam: credibilityScore < 40,
    credibilityScore,
    spamReason: credibilityScore >= 60
      ? 'Report appears credible based on available evidence'
      : 'Report has multiple red flags suggesting low credibility',
    category,
    redFlags,
    supportingFactors,
    recommendation: credibilityScore >= 70 ? 'APPROVE' : credibilityScore >= 40 ? 'REVIEW_MANUALLY' : 'REJECT',
    source: 'fallback'
  };
};

export default {
  compileReports,
  analyzeReportWithImages,
  groupReportsByLocationAndTime,
  getSeverityColor,
  analyzeClassSuspensionReports,
  analyzeSuspensionAdvisory,
  analyzeCompiledLocationReports,
  analyzeIndividualReportCredibility
};
