import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Loader,
  AlertCircle,
  Download,
  Check,
  Globe,
} from "lucide-react";

const AITextProcessor = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState({
    summarizer: "checking",
    languageDetector: "checking",
    translator: "checking",
  });
  const [modelDownloadProgress, setModelDownloadProgress] = useState({
    summarizer: null,
    languageDetector: null,
    translator: null,
  });
  const messagesEndRef = useRef(null);
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [selectedLanguages, setSelectedLanguages] = useState({
    source: "",
    target: "en", // Default target language
  });
  const languageDetectorRef = useRef(null);
  const summarizerRef = useRef(null);

  // Check API availability on component mount
  useEffect(() => {
    checkAPIAvailability();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    console.log(
      "Language detector available:",
      "ai" in window && "languageDetector" in window.ai
    );
    if ("ai" in window && "languageDetector" in window.ai) {
      console.log("Language detector API:", window.ai.languageDetector);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Check if APIs are available
  const checkAPIAvailability = async () => {
    // Check language detector
    try {
      if ("ai" in window && "languageDetector" in window.ai) {
        const capabilities = await window.ai.languageDetector.capabilities();
        console.log("Language detector capabilities:", capabilities);
        setApiStatus((prev) => ({
          ...prev,
          languageDetector: capabilities.available || "unavailable",
        }));
      } else {
        setApiStatus((prev) => ({ ...prev, languageDetector: "unavailable" }));
      }
    } catch (error) {
      console.error("Error checking language detector:", error);
      setApiStatus((prev) => ({ ...prev, languageDetector: "unavailable" }));
    }

    // Check summarizer
    try {
      if ("ai" in window && "summarizer" in window.ai) {
        const capabilities = await window.ai.summarizer.capabilities();
        console.log("Summarizer capabilities:", capabilities);
        setApiStatus((prev) => ({
          ...prev,
          summarizer: capabilities.available || "unavailable",
        }));
      } else {
        setApiStatus((prev) => ({ ...prev, summarizer: "unavailable" }));
      }
    } catch (error) {
      console.error("Error checking summarizer:", error);
      setApiStatus((prev) => ({ ...prev, summarizer: "unavailable" }));
    }
  };

  (async function checkTranslator() {
    try {
      if ("ai" in window && "translator" in window.ai) {
        const capabilities = await window.ai.translator.capabilities();
        console.log("Translator capabilities:", capabilities);

        // Get Chrome's preferred languages
        const preferredLanguages = navigator.languages || [navigator.language];
        console.log("Browser preferred languages:", preferredLanguages);

        // Check common language pairs
        const commonLanguages = [
          "en",
          "es",
          "fr",
          "de",
          "zh",
          "ja",
          "ru",
          "pt",
          "tr",
          "hi",
          "vi",
          "bn",
        ];
        const availablePairs = [];

        for (const source of preferredLanguages) {
          const shortSource = source.split("-")[0]; // Get base language code

          for (const target of commonLanguages) {
            if (shortSource === target) continue;

            const availability = await capabilities.languagePairAvailable(
              shortSource,
              target
            );
            if (availability !== "no") {
              availablePairs.push({
                source: shortSource,
                target,
                availability,
              });
            }
          }
        }

        setAvailableLanguages(availablePairs);

        if (availablePairs.length > 0) {
          setApiStatus((prev) => ({
            ...prev,
            translator: availablePairs.some(
              (pair) => pair.availability === "readily"
            )
              ? "readily"
              : "after-download",
          }));

          // Set default source language based on detection
          if (preferredLanguages.length > 0) {
            setSelectedLanguages((prev) => ({
              ...prev,
              source: preferredLanguages[0].split("-")[0],
            }));
          }
        } else {
          setApiStatus((prev) => ({ ...prev, translator: "unavailable" }));
        }
      } else {
        setApiStatus((prev) => ({ ...prev, translator: "unavailable" }));
      }
    } catch (error) {
      console.error("Error checking translator:", error);
      setApiStatus((prev) => ({ ...prev, translator: "unavailable" }));
    }
  })();

  // Initialize language detector
  const initializeLanguageDetector = async () => {
    if (languageDetectorRef.current) {
      return languageDetectorRef.current;
    }

    if (apiStatus.languageDetector === "readily") {
      try {
        const detector = await window.ai.languageDetector.create();
        languageDetectorRef.current = detector;
        return detector;
      } catch (error) {
        console.error("Error initializing language detector:", error);
        return null;
      }
    } else if (apiStatus.languageDetector === "after-download") {
      try {
        setModelDownloadProgress((prev) => ({
          ...prev,
          languageDetector: { loaded: 0, total: 100 },
        }));

        const detector = await window.ai.languageDetector.create({
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => {
              setModelDownloadProgress((prev) => ({
                ...prev,
                languageDetector: {
                  loaded: e.loaded,
                  total: e.total || 100,
                },
              }));
            });
          },
        });

        await detector.ready;
        languageDetectorRef.current = detector;

        setApiStatus((prev) => ({ ...prev, languageDetector: "readily" }));
        setModelDownloadProgress((prev) => ({
          ...prev,
          languageDetector: null,
        }));

        return detector;
      } catch (error) {
        console.error("Error downloading language detector model:", error);
        setModelDownloadProgress((prev) => ({
          ...prev,
          languageDetector: null,
        }));
        return null;
      }
    }

    return null;
  };

  // Detect language using browser's language detector API
  const detectLanguage = async (text) => {
    if (
      apiStatus.languageDetector === "unavailable" ||
      apiStatus.languageDetector === "no"
    ) {
      return "unknown";
    }

    try {
      const detector = await initializeLanguageDetector();
      if (!detector) {
        return "unknown";
      }

      const results = await detector.detect(text);

      // Handle the format we now know exists
      if (results && Array.isArray(results) && results.length > 0) {
        const topLanguage = results[0];
        return {
          code: topLanguage.detectedLanguage, // Changed from languageCode to detectedLanguage
          confidence: topLanguage.confidence,
          allDetected: results.slice(0, 3).map((lang) => ({
            code: lang.detectedLanguage, // Changed from languageCode to detectedLanguage
            confidence: lang.confidence,
          })),
        };
      }

      console.warn("Unexpected language detection result structure:", results);
      return "unknown";
    } catch (error) {
      console.error("Error detecting language:", error);
      return "unknown";
    }
  };

  // Initialize summarizer
  const initializeSummarizer = async () => {
    if (summarizerRef.current) {
      return summarizerRef.current;
    }

    const options = {
      type: "key-points",
      format: "markdown",
      length: "medium",
    };

    if (apiStatus.summarizer === "readily") {
      try {
        const summarizer = await window.ai.summarizer.create(options);
        summarizerRef.current = summarizer;
        return summarizer;
      } catch (error) {
        console.error("Error initializing summarizer:", error);
        return null;
      }
    } else if (apiStatus.summarizer === "after-download") {
      try {
        setModelDownloadProgress((prev) => ({
          ...prev,
          summarizer: { loaded: 0, total: 100 },
        }));

        const summarizer = await window.ai.summarizer.create({
          ...options,
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => {
              setModelDownloadProgress((prev) => ({
                ...prev,
                summarizer: {
                  loaded: e.loaded,
                  total: e.total || 100,
                },
              }));
            });
          },
        });

        await summarizer.ready;
        summarizerRef.current = summarizer;

        setApiStatus((prev) => ({ ...prev, summarizer: "readily" }));
        setModelDownloadProgress((prev) => ({ ...prev, summarizer: null }));

        return summarizer;
      } catch (error) {
        console.error("Error downloading summarizer model:", error);
        setModelDownloadProgress((prev) => ({ ...prev, summarizer: null }));
        return null;
      }
    }

    return null;
  };
  // Initialize translator for a specific language pair
  const initializeTranslator = async (sourceLanguage, targetLanguage) => {
    // Check if we already have this translator
    const translatorKey = `${sourceLanguage}-${targetLanguage}`;
    if (translatorRef.current[translatorKey]) {
      return translatorRef.current[translatorKey];
    }

    if (
      apiStatus.translator === "unavailable" ||
      apiStatus.translator === "no"
    ) {
      return null;
    }

    try {
      setModelDownloadProgress((prev) => ({
        ...prev,
        translator: { loaded: 0, total: 100 },
      }));

      const translator = await window.ai.translator.create({
        sourceLanguage,
        targetLanguage,
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            setModelDownloadProgress((prev) => ({
              ...prev,
              translator: {
                loaded: e.loaded,
                total: e.total || 100,
              },
            }));
          });
        },
      });

      await translator.ready;
      translatorRef.current[translatorKey] = translator;

      setApiStatus((prev) => ({ ...prev, translator: "readily" }));
      setModelDownloadProgress((prev) => ({ ...prev, translator: null }));

      return translator;
    } catch (error) {
      console.error(
        `Error initializing translator for ${sourceLanguage} to ${targetLanguage}:`,
        error
      );
      setModelDownloadProgress((prev) => ({ ...prev, translator: null }));
      return null;
    }
  };

  // Summarize text
  const summarizeText = async (text, messageId) => {
    try {
      // Update message to show summarizing state
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, isSummarizing: true } : msg
        )
      );

      const summarizer = await initializeSummarizer();
      if (!summarizer) {
        throw new Error("Failed to initialize summarizer");
      }

      console.log("Attempting to summarize text of length:", text.length);

      const result = await summarizer.summarize(text);
      console.log("Summarization result:", result);

      // Handle different result formats
      const summaryText =
        typeof result === "string"
          ? result
          : result && typeof result.summary === "string"
          ? result.summary
          : JSON.stringify(result);

      // Update message with summary
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                summary: summaryText,
                isSummarizing: false,
                showSummary: true,
              }
            : msg
        )
      );
    } catch (error) {
      console.error("Detailed summarization error:", error);

      // Update message to show error
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                isSummarizing: false,
                summaryError: true,
                summaryErrorMessage:
                  error.message || "Failed to generate summary",
              }
            : msg
        )
      );
    }
  };
  // Translate text
  const translateText = async (
    text,
    sourceLanguage,
    targetLanguage,
    messageId
  ) => {
    try {
      // Update message to show translating state
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId ? { ...msg, isTranslating: true } : msg
        )
      );

      const translator = await initializeTranslator(
        sourceLanguage,
        targetLanguage
      );
      if (!translator) {
        throw new Error("Failed to initialize translator");
      }

      console.log(`Translating from ${sourceLanguage} to ${targetLanguage}`);
      const translatedText = await translator.translate(text);
      console.log("Translation result:", translatedText);

      // Update message with translation
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                translation: {
                  text: translatedText,
                  source: sourceLanguage,
                  target: targetLanguage,
                },
                isTranslating: false,
                showTranslation: true,
              }
            : msg
        )
      );
    } catch (error) {
      console.error("Translation error:", error);

      // Update message to show error
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                isTranslating: false,
                translationError: true,
                translationErrorMessage:
                  error.message || "Failed to translate text",
              }
            : msg
        )
      );
    }
  };

  // Add toggle translation function
  const toggleTranslation = (messageId) => {
    setMessages((prevMessages) =>
      prevMessages.map((msg) =>
        msg.id === messageId
          ? { ...msg, showTranslation: !msg.showTranslation }
          : msg
      )
    );
  };

  // Handle downloading the model
  const downloadModel = async (type) => {
    if (type === "languageDetector") {
      await initializeLanguageDetector();
    } else if (type === "summarizer") {
      await initializeSummarizer();
    } else if (type === "translator") {
      // Download the default language pair
      await initializeTranslator(
        selectedLanguages.source,
        selectedLanguages.target
      );
    }
  };
  // Handle sending a message
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    const wordCount = inputText.trim().split(/\s+/).length;
    const messageId = messages.length + 1;
    const newMessage = {
      id: messageId,
      text: inputText,
      timestamp: new Date(),
      language: "detecting...",
      isLongText: inputText.length > 50,
      wordCount: wordCount, // Add this line
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText("");

    // Detect language
    const languageResult = await detectLanguage(inputText);
    const isEnglish =
      typeof languageResult === "object"
        ? languageResult.code === "en"
        : languageResult === "en";

    // Update message with language info and summarization eligibility
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              language: languageResult,
              canSummarize:
                isEnglish &&
                msg.wordCount > 150 && // Changed from msg.isLongText to msg.wordCount > 150
                (apiStatus.summarizer === "readily" ||
                  apiStatus.summarizer === "after-download"),
            }
          : msg
      )
    );

    setIsLoading(false);
  };

  // Toggle summary visibility
  const toggleSummary = (messageId) => {
    setMessages((prevMessages) =>
      prevMessages.map((msg) =>
        msg.id === messageId ? { ...msg, showSummary: !msg.showSummary } : msg
      )
    );
  };

  // Format language display
  const formatLanguageDisplay = (langResult) => {
    if (langResult === "detecting...") {
      return <span className="italic text-gray-400">Detecting...</span>;
    }

    if (langResult === "unknown") {
      return <span className="text-amber-600">Unknown</span>;
    }

    if (typeof langResult === "object") {
      return (
        <div>
          <span className="font-medium">
            {getLanguageName(langResult.code)}
          </span>
          <span className="ml-1 text-gray-400">
            ({langResult.code}) - {(langResult.confidence * 100).toFixed(1)}%
          </span>
        </div>
      );
    }

    return langResult;
  };

  // Get language name from code
  const getLanguageName = (code) => {
    const languages = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
      zh: "Chinese",
      ja: "Japanese",
      ko: "Korean",
      ar: "Arabic",
      hi: "Hindi",
    };

    return languages[code] || code;
  };

  // Render API status indicator
  const renderApiStatus = () => {
    return (
      <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
        <h3 className="text-lg font-medium text-gray-800 mb-2">API Status</h3>

        <div className="space-y-2">
          <div className="flex items-center">
            <span className="w-40 text-sm text-gray-600">
              Language Detection:
            </span>
            {apiStatus.languageDetector === "checking" && (
              <span className="flex items-center text-yellow-500">
                <Loader className="w-4 h-4 mr-1 animate-spin" /> Checking...
              </span>
            )}
            {apiStatus.languageDetector === "readily" && (
              <span className="flex items-center text-green-500">
                <Check className="w-4 h-4 mr-1" /> Ready
              </span>
            )}
            {apiStatus.languageDetector === "after-download" && (
              <div className="flex flex-col">
                <span className="flex items-center text-yellow-500">
                  <Download className="w-4 h-4 mr-1" /> Model download required
                </span>
                {modelDownloadProgress.languageDetector ? (
                  <div className="mt-1">
                    <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${
                            (modelDownloadProgress.languageDetector.loaded /
                              modelDownloadProgress.languageDetector.total) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 mt-1">
                      {Math.round(
                        (modelDownloadProgress.languageDetector.loaded /
                          modelDownloadProgress.languageDetector.total) *
                          100
                      )}
                      %
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => downloadModel("languageDetector")}
                    className="mt-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Download Model
                  </button>
                )}
              </div>
            )}
            {(apiStatus.languageDetector === "no" ||
              apiStatus.languageDetector === "unavailable") && (
              <span className="flex items-center text-red-500">
                <AlertCircle className="w-4 h-4 mr-1" /> Not available
              </span>
            )}
          </div>

          <div className="flex items-center">
            <span className="w-40 text-sm text-gray-600">Summarization:</span>
            {apiStatus.summarizer === "checking" && (
              <span className="flex items-center text-yellow-500">
                <Loader className="w-4 h-4 mr-1 animate-spin" /> Checking...
              </span>
            )}
            {apiStatus.summarizer === "readily" && (
              <span className="flex items-center text-green-500">
                <Check className="w-4 h-4 mr-1" /> Ready
              </span>
            )}
            {apiStatus.summarizer === "after-download" && (
              <div className="flex flex-col">
                <span className="flex items-center text-yellow-500">
                  <Download className="w-4 h-4 mr-1" /> Model download required
                </span>
                {modelDownloadProgress.summarizer ? (
                  <div className="mt-1">
                    <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${
                            (modelDownloadProgress.summarizer.loaded /
                              modelDownloadProgress.summarizer.total) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 mt-1">
                      {Math.round(
                        (modelDownloadProgress.summarizer.loaded /
                          modelDownloadProgress.summarizer.total) *
                          100
                      )}
                      %
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => downloadModel("summarizer")}
                    className="mt-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Download Model
                  </button>
                )}
              </div>
            )}
            {(apiStatus.summarizer === "no" ||
              apiStatus.summarizer === "unavailable") && (
              <span className="flex items-center text-red-500">
                <AlertCircle className="w-4 h-4 mr-1" /> Not available
              </span>
            )}
          </div>

          <div className="flex items-center">
            <span className="w-40 text-sm text-gray-600">Translation:</span>
            {apiStatus.translator === "checking" && (
              <span className="flex items-center text-yellow-500">
                <Loader className="w-4 h-4 mr-1 animate-spin" /> Checking...
              </span>
            )}
            {apiStatus.translator === "readily" && (
              <span className="flex items-center text-green-500">
                <Check className="w-4 h-4 mr-1" /> Ready
              </span>
            )}
            {apiStatus.translator === "after-download" && (
              <div className="flex flex-col">
                <span className="flex items-center text-yellow-500">
                  <Download className="w-4 h-4 mr-1" /> Model download required
                </span>
                {modelDownloadProgress.translator ? (
                  <div className="mt-1">
                    <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${
                            (modelDownloadProgress.translator.loaded /
                              modelDownloadProgress.translator.total) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 mt-1">
                      {Math.round(
                        (modelDownloadProgress.translator.loaded /
                          modelDownloadProgress.translator.total) *
                          100
                      )}
                      %
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => downloadModel("translator")}
                    className="mt-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Download Model
                  </button>
                )}
              </div>
            )}
            {(apiStatus.translator === "no" ||
              apiStatus.translator === "unavailable") && (
              <span className="flex items-center text-red-500">
                <AlertCircle className="w-4 h-4 mr-1" /> Not available
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-4">
          {renderApiStatus()}

          {messages.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <p>Start typing to begin a conversation</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="bg-white rounded-lg shadow-sm p-4">
              <div className="text-gray-800 whitespace-pre-wrap">
                {message.text}
              </div>

              <div className="mt-2 text-sm flex items-start">
                <Globe className="w-4 h-4 mr-1 mt-0.5 text-blue-500" />
                <div className="text-gray-700">
                  {formatLanguageDisplay(message.language)}
                </div>
              </div>

              {message.isLongText && (
                <div className="mt-1 px-2 py-0.5 inline-block bg-blue-100 text-blue-800 text-xs rounded-full">
                  {message.wordCount || message.text.trim().split(/\s+/).length}{" "}
                  words
                </div>
              )}

              {message.canSummarize &&
                !message.summary &&
                !message.isSummarizing && (
                  <div className="mt-3">
                    <button
                      onClick={() => summarizeText(message.text, message.id)}
                      className="px-3 py-1 bg-blue-500 text-black text-sm rounded hover:bg-blue-600"
                    >
                      Summarize
                    </button>
                    {apiStatus.summarizer === "after-download" &&
                      !summarizerRef.current && (
                        <span className="ml-2 text-xs text-amber-600">
                          Model download required
                        </span>
                      )}
                  </div>
                )}

              {message.isLongText &&
                typeof message.language === "object" &&
                message.language.code === "en" &&
                (apiStatus.summarizer === "no" ||
                  apiStatus.summarizer === "unavailable") && (
                  <div className="mt-2 flex items-center text-amber-600 text-sm">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Summarization not available in your browser
                  </div>
                )}

              {message.isSummarizing && (
                <div className="mt-2 flex items-center text-gray-500">
                  <Loader className="h-4 w-4 animate-spin mr-2" />
                  Summarizing...
                </div>
              )}

              {message.summaryError && (
                <div className="mt-2 text-sm text-red-500 flex items-start">
                  <AlertCircle className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                  <span>
                    {message.summaryErrorMessage ||
                      "Failed to generate summary. Please try again."}
                  </span>
                </div>
              )}

              {message.summary && (
                <div className="mt-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-medium text-gray-700">
                      Summary
                    </h3>
                    <button
                      onClick={() => toggleSummary(message.id)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      {message.showSummary ? "Hide" : "Show"}
                    </button>
                  </div>

                  {message.showSummary && (
                    <div className="mt-2 p-3 bg-gray-50 rounded text-sm whitespace-pre-wrap">
                      {message.summary}
                    </div>
                  )}
                </div>
              )}
              {/* Translation section */}
              {typeof message.language === "object" &&
                message.language.code !== "unknown" && (
                  <div className="mt-3">
                    {!message.translation && !message.isTranslating && (
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center">
                          <select
                            value={selectedLanguages.target}
                            onChange={(e) =>
                              setSelectedLanguages((prev) => ({
                                ...prev,
                                target: e.target.value,
                              }))
                            }
                            className="mr-2 text-sm border border-gray-300 rounded p-1"
                          >
                            {availableLanguages
                              .filter(
                                (lang) => lang.source === message.language.code
                              )
                              .map((lang) => (
                                <option key={lang.target} value={lang.target}>
                                  {getLanguageName(lang.target)}
                                </option>
                              ))}
                            {availableLanguages.length === 0 && (
                              <option value="en">English</option>
                            )}
                          </select>

                          <button
                            onClick={() =>
                              translateText(
                                message.text,
                                message.language.code,
                                selectedLanguages.target,
                                message.id
                              )
                            }
                            className="px-3 py-1 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 flex items-center"
                          >
                            <Globe className="w-4 h-4 mr-1" />
                            Translate
                          </button>

                          {apiStatus.translator === "after-download" &&
                            Object.keys(translatorRef.current).length === 0 && (
                              <span className="ml-2 text-xs text-amber-600">
                                Model download required
                              </span>
                            )}
                        </div>
                      </div>
                    )}

                    {message.isTranslating && (
                      <div className="mt-2 flex items-center text-gray-500">
                        <Loader className="h-4 w-4 animate-spin mr-2" />
                        Translating...
                      </div>
                    )}

                    {message.translationError && (
                      <div className="mt-2 text-sm text-red-500 flex items-start">
                        <AlertCircle className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                        <span>
                          {message.translationErrorMessage ||
                            "Failed to translate. Please try again."}
                        </span>
                      </div>
                    )}

                    {message.translation && (
                      <div className="mt-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium text-gray-700 flex items-center">
                            <Globe className="w-4 h-4 mr-1 text-indigo-500" />
                            Translated to{" "}
                            {getLanguageName(message.translation.target)}
                          </h3>
                          <button
                            onClick={() => toggleTranslation(message.id)}
                            className="text-xs text-indigo-500 hover:text-indigo-700"
                          >
                            {message.showTranslation ? "Hide" : "Show"}
                          </button>
                        </div>

                        {message.showTranslation && (
                          <div className="mt-2 p-3 bg-indigo-50 rounded text-sm whitespace-pre-wrap">
                            {message.translation.text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t bg-white p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex space-x-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your message here..."
              className="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !inputText.trim()}
              className={`p-3 rounded-lg flex items-center justify-center ${
                isLoading || !inputText.trim()
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {isLoading ? (
                <Loader className="h-6 w-6 animate-spin" />
              ) : (
                <Send className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITextProcessor;
