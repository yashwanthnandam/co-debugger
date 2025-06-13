export interface SimplificationOptions {
    maxDepth: number;
    maxArrayLength: number;
    maxStringLength: number;
    maxObjectKeys: number;
    showPointerAddresses: boolean;
    expandKnownTypes: string[];
    truncateThreshold: number;
    preserveBusinessFields: string[];
    enableLazyExpansion: boolean;
    memoryLimit: number; // MB
    forceFullExpansion?: boolean; // NEW: Force complete expansion for JSON display
}

export interface SimplifiedValue {
    originalType: string;
    displayValue: string;
    isExpanded: boolean;
    hasMore: boolean;
    children?: Record<string, SimplifiedValue>;
    metadata: {
        isPointer: boolean;
        isNil: boolean;
        memoryAddress?: string;
        arrayLength?: number;
        objectKeyCount?: number;
        truncatedAt?: number;
        sizeEstimate?: number;
        expandable?: boolean;
        lazyLoadId?: string;
        recursionDepth?: number;
        circularRefId?: string;
        fullJSONAvailable?: boolean; // NEW: Indicates if full JSON can be generated
    };
}

export interface VariableExpansionRequest {
    variableName: string;
    path: string[];
    maxDepth: number;
    session: any;
    frameId: number;
    variablesReference: number;
}

export interface RecursionContext {
    visited: Set<string>;
    addressMap: Map<string, SimplifiedValue>;
    currentDepth: number;
    maxDepth: number;
    memoryUsed: number;
    memoryLimit: number;
    forceFullExpansion?: boolean; // NEW
}

export class DataStructureHandler {
    protected defaultOptions: SimplificationOptions = {
        maxDepth: 6,
        maxArrayLength: 50,
        maxStringLength: 1000,
        maxObjectKeys: 50,
        showPointerAddresses: false,
        expandKnownTypes: [
            'string', 'int', 'int64', 'float64', 'bool', 'time.Time',
            'context.Context', 'http.Request', 'http.Response'
        ],
        truncateThreshold: 2000,
        preserveBusinessFields: [
            'id', 'name', 'value', 'data', 'result', 'error', 'message',
            'status', 'code', 'type', 'timestamp', 'created', 'updated'
        ],
        enableLazyExpansion: true,
        memoryLimit: 50, // 50MB limit
        forceFullExpansion: false
    };

    protected expansionCache = new Map<string, SimplifiedValue>();
    protected lazyExpansionRequests = new Map<string, VariableExpansionRequest>();

    /**
 * FIXED: Main entry point with emergency safety
 */
simplifyValue(
    rawValue: string, 
    typeName: string, 
    options: Partial<SimplificationOptions> = {}
): SimplifiedValue {
    const opts = { ...this.defaultOptions, ...options };
    
    // **ENFORCE SAFETY LIMITS**
    const safeMaxDepth = Math.min(opts.maxDepth, 6); // Never exceed 6
    const safeMemoryLimit = Math.min(opts.memoryLimit * 1024 * 1024, 100 * 1024 * 1024); // Max 100MB
    
    // Initialize recursion context with safety
    const context: RecursionContext = {
        visited: new Set<string>(),
        addressMap: new Map<string, SimplifiedValue>(),
        currentDepth: 0,
        maxDepth: safeMaxDepth,
        memoryUsed: 0,
        memoryLimit: safeMemoryLimit,
        forceFullExpansion: false // Always false to prevent infinite loops
    };

    console.log(`🔍 [2025-06-09 16:20:11] Safe simplification: ${typeName} (max depth: ${safeMaxDepth})`);
    
    try {
        return this.recursivelySimplify(rawValue, typeName, context, opts);
    } catch (error) {
        console.error(`❌ Fatal error in simplification:`, error);
        return this.createSimpleValue(`[Fatal Error: ${error.message}]`, typeName);
    }
}

    /**
     * NEW: Force full expansion for JSON display
     */
    simplifyValueForJSON(
        rawValue: string, 
        typeName: string, 
        maxDepth: number = 6
    ): SimplifiedValue {
        return this.simplifyValue(rawValue, typeName, {
            maxDepth,
            maxArrayLength: 200, // More items for JSON
            maxStringLength: 5000, // Longer strings for JSON
            maxObjectKeys: 200, // More fields for JSON
            forceFullExpansion: true,
            enableLazyExpansion: false,
            truncateThreshold: 10000
        });
    }

  /**
 * FIXED: Recursive core function with proper depth enforcement
 */
protected recursivelySimplify(
    rawValue: string,
    typeName: string,
    context: RecursionContext,
    options: SimplificationOptions
): SimplifiedValue {
    // **STRICT RECURSION GUARD: Always enforce limits**
    if (context.currentDepth >= context.maxDepth) {
        console.log(`⚠️ HARD STOP at depth ${context.currentDepth}/${context.maxDepth} for: ${typeName}`);
        return this.createTruncatedValue(rawValue, typeName, `Max depth ${context.maxDepth} reached`);
    }

    // **MEMORY LIMIT: Always enforce even with forceFullExpansion**
    if (context.memoryUsed >= context.memoryLimit) {
        console.log(`⚠️ MEMORY LIMIT reached: ${context.memoryUsed}/${context.memoryLimit}`);
        return this.createTruncatedValue(rawValue, typeName, 'Memory limit exceeded');
    }

    // **CIRCULAR REFERENCE DETECTION: Check before processing**
    const valueSignature = this.createValueSignature(rawValue, typeName, context.currentDepth);
    if (context.visited.has(valueSignature)) {
        console.log(`🔄 CIRCULAR REFERENCE detected: ${valueSignature}`);
        return this.createSimpleValue(`[↻ Circular]`, typeName, {
            circularRefId: valueSignature,
            recursionDepth: context.currentDepth
        });
    }

    // **MARK AS VISITED**
    context.visited.add(valueSignature);

    let result: SimplifiedValue;

    try {
        // **STEP 1: Handle nil values early**
        if (this.isNilValue(rawValue)) {
            result = this.createSimpleValue('nil', typeName, { isNil: true, fullJSONAvailable: true });
        }
        // **STEP 2: Parse Delve format and extract address**
        else if (this.parseDelveFormat(rawValue, typeName)) {
            const delveInfo = this.parseDelveFormat(rawValue, typeName);
            result = this.handleDelveFormat(delveInfo!, context, options);
        }
        // **STEP 3: Handle pointer dereferencing with circular detection**
        else if (this.isPointerSyntax(rawValue, typeName)) {
            result = this.handlePointerDereferencing(rawValue, typeName, context, options);
        }
        // **STEP 4: Handle collections recursively**
        else if (this.isCollectionType(rawValue, typeName)) {
            result = this.handleCollectionRecursively(rawValue, typeName, context, options);
        }
        // **STEP 5: Handle structured data recursively**
        else if (this.isStructuredType(rawValue, typeName)) {
            result = this.handleStructRecursively(rawValue, typeName, context, options);
        }
        // **STEP 6: Handle primitives**
        else if (this.isPrimitiveType(typeName)) {
            result = this.handlePrimitive(rawValue, typeName, options);
        }
        // **FALLBACK: JSON or unknown**
        else if (this.isPossibleJSON(rawValue)) {
            result = this.handleJSONRecursively(rawValue, typeName, context, options);
        }
        else {
            result = this.handlePrimitive(rawValue, typeName, options);
        }
    } catch (error) {
        console.error(`❌ Error processing ${typeName} at depth ${context.currentDepth}:`, error);
        result = this.createSimpleValue(`[Error: ${error.message}]`, typeName);
    }

    // **REMOVE FROM VISITED after processing**
    context.visited.delete(valueSignature);

    return result;
}

/**
 * FIXED: Create unique signature for circular detection
 */
protected createValueSignature(rawValue: string, typeName: string, depth: number): string {
    // Create a unique signature that includes type, value hash, and reasonable depth
    const valueHash = this.simpleHash(rawValue.substring(0, 100));
    return `${typeName}:${valueHash}:${Math.floor(depth / 10)}`; // Group by depth ranges
}

protected simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * FIXED: Handle pointer dereferencing with strict depth control
 */
protected handlePointerDereferencing(
    rawValue: string,
    typeName: string,
    context: RecursionContext,
    options: SimplificationOptions
): SimplifiedValue {
    console.log(`🎯 Dereferencing pointer at depth ${context.currentDepth}: ${typeName}`);

    // **STRICT DEPTH LIMIT for pointers**
    if (context.currentDepth >= 3) {
        console.log(`⚠️ Pointer depth limit reached at ${context.currentDepth}`);
        return this.createSimpleValue(`${typeName} {...}`, typeName, {
            isPointer: true,
            expandable: false, // Don't allow further expansion
            recursionDepth: context.currentDepth
        });
    }

    // Extract actual value from pointer syntax
    const actualValue = this.extractPointerValue(rawValue);
    const actualType = typeName.startsWith('*') ? typeName.substring(1) : typeName;

    // **RECURSIVE DEREFERENCING with strict depth control**
    if (actualValue !== rawValue) {
        const childContext: RecursionContext = {
            ...context,
            currentDepth: context.currentDepth + 1,
            visited: new Set(context.visited) // Create new visited set for this branch
        };

        const derefResult = this.recursivelySimplify(actualValue, actualType, childContext, options);
        derefResult.metadata.isPointer = true;
        derefResult.metadata.fullJSONAvailable = true;
        
        console.log(`✅ Successfully dereferenced: ${typeName} at depth ${context.currentDepth}`);
        return derefResult;
    }

    // Fallback for complex or deep pointers
    return this.createSimpleValue(`${actualType} {...}`, actualType, {
        isPointer: true,
        expandable: false,
        recursionDepth: context.currentDepth
    });
}

/**
 * FIXED: Handle collections with strict limits
 */
protected handleCollectionRecursively(
    rawValue: string,
    typeName: string,
    context: RecursionContext,
    options: SimplificationOptions
): SimplifiedValue {
    console.log(`📚 Processing collection at depth ${context.currentDepth}: ${typeName}`);

    // **STRICT DEPTH CHECK**
    if (context.currentDepth >= context.maxDepth - 1) {
        return this.createSimpleValue(`${typeName}[...] (depth limit)`, typeName, {
            expandable: false,
            recursionDepth: context.currentDepth
        });
    }

    // Extract collection metadata
    const lengthMatch = rawValue.match(/len:\s*(\d+)|length:\s*(\d+)/);
    const arrayLength = lengthMatch ? parseInt(lengthMatch[1] || lengthMatch[2]) : undefined;

    if (arrayLength === 0 || rawValue === '[]' || rawValue === 'nil') {
        return this.createSimpleValue('[]', typeName, { arrayLength: 0, fullJSONAvailable: true });
    }

    // **STRICT LIMITS**
    const elements = this.parseArrayElements(rawValue);
    const maxElements = Math.min(elements.length, 10); // Limit to 10 elements max
    
    const children: Record<string, SimplifiedValue> = {};
    const childContext: RecursionContext = {
        ...context,
        currentDepth: context.currentDepth + 1,
        visited: new Set(context.visited)
    };

    for (let i = 0; i < maxElements; i++) {
        const element = elements[i];
        const elementType = this.inferElementType(element, typeName);
        
        try {
            children[`[${i}]`] = this.recursivelySimplify(element, elementType, childContext, options);
        } catch (error) {
            console.error(`❌ Error processing element ${i}:`, error);
            children[`[${i}]`] = this.createSimpleValue(`[Error]`, elementType);
            break; // Stop processing on error
        }
    }

    const hasMore = elements.length > maxElements;
    const displayValue = `Array[${elements.length}]${hasMore ? ` (showing ${maxElements})` : ''}`;

    return {
        originalType: typeName,
        displayValue,
        isExpanded: true,
        hasMore,
        children,
        metadata: {
            isPointer: false,
            isNil: false,
            arrayLength: elements.length,
            expandable: false, // Prevent further expansion
            recursionDepth: context.currentDepth,
            fullJSONAvailable: true
        }
    };
}

/**
 * FIXED: Handle structs with strict limits
 */
protected handleStructRecursively(
    rawValue: string,
    typeName: string,
    context: RecursionContext,
    options: SimplificationOptions
): SimplifiedValue {
    console.log(`🏗️ Processing struct at depth ${context.currentDepth}: ${typeName}`);

    // **STRICT DEPTH CHECK**
    if (context.currentDepth >= context.maxDepth - 1) {
        return this.createSimpleValue(`${typeName}{...} (depth limit)`, typeName, {
            expandable: false,
            recursionDepth: context.currentDepth
        });
    }

    const fields = this.parseStructFields(rawValue);
    
    if (Object.keys(fields).length === 0) {
        return this.createSimpleValue('{}', typeName, { fullJSONAvailable: true });
    }

    // **STRICT LIMITS**
    const sortedFields = this.prioritizeFields(fields, options.preserveBusinessFields);
    const maxFields = Math.min(Object.keys(sortedFields).length, 8); // Limit to 8 fields max
    
    const truncatedFields = Object.fromEntries(
        Object.entries(sortedFields).slice(0, maxFields)
    );

    const children: Record<string, SimplifiedValue> = {};
    const childContext: RecursionContext = {
        ...context,
        currentDepth: context.currentDepth + 1,
        visited: new Set(context.visited)
    };

    Object.entries(truncatedFields).forEach(([key, value]) => {
        const fieldType = this.inferFieldType(key, value);
        
        try {
            children[key] = this.recursivelySimplify(value, fieldType, childContext, options);
        } catch (error) {
            console.error(`❌ Error processing field ${key}:`, error);
            children[key] = this.createSimpleValue(`[Error]`, fieldType);
        }
    });

    const hasMore = Object.keys(fields).length > maxFields;
    const displayValue = this.createStructSummary(typeName, Object.keys(truncatedFields), hasMore);

    return {
        originalType: typeName,
        displayValue,
        isExpanded: true,
        hasMore,
        children,
        metadata: {
            isPointer: false,
            isNil: false,
            objectKeyCount: Object.keys(fields).length,
            expandable: false, // Prevent further expansion
            recursionDepth: context.currentDepth,
            fullJSONAvailable: true
        }
    };
}

/**
 * FIXED: Deep expand with emergency stops
 */
protected async deepExpandVariable(
    session: any,
    variable: any,
    path: string[],
    maxDepth: number,
    currentDepth: number,
    forceFullExpansion: boolean = false
): Promise<SimplifiedValue> {
    // **EMERGENCY STOPS**
    if (currentDepth >= 6) { // Hard limit regardless of settings
        console.log(`🛑 EMERGENCY STOP at depth ${currentDepth} for ${variable.name}`);
        return this.createTruncatedValue(
            variable.value,
            variable.type,
            `Emergency stop at depth ${currentDepth}`
        );
    }

    if (path.length > 10) { // Prevent deep path traversal
        console.log(`🛑 PATH LIMIT reached for ${variable.name}: ${path.length}`);
        return this.createTruncatedValue(
            variable.value,
            variable.type,
            `Path limit exceeded`
        );
    }

    const result: SimplifiedValue = {
        originalType: variable.type,
        displayValue: variable.value,
        isExpanded: true,
        hasMore: false,
        children: {},
        metadata: {
            isPointer: variable.type?.includes('*') || false,
            isNil: variable.value === 'nil' || variable.value === '<nil>',
            sizeEstimate: this.estimateSize(variable.value),
            recursionDepth: currentDepth,
            fullJSONAvailable: true
        }
    };

    // **RECURSIVE EXPANSION with strict limits**
    if (variable.variablesReference && variable.variablesReference > 0 && currentDepth < 4) {
        try {
            const children = await session.customRequest('variables', {
                variablesReference: variable.variablesReference
            });
            
            if (children.variables && children.variables.length > 0) {
                console.log(`📂 Expanding ${Math.min(children.variables.length, 5)} children for ${variable.name} at depth ${currentDepth}`);
                
                const sortedChildren = this.sortChildrenByImportance(children.variables);
                const maxChildren = Math.min(sortedChildren.length, 5); // Hard limit of 5 children
                
                for (let i = 0; i < maxChildren; i++) {
                    const child = sortedChildren[i];
                    const childPath = [...path, child.name];
                    
                    result.children![child.name] = await this.deepExpandVariable(
                        session,
                        child,
                        childPath,
                        maxDepth,
                        currentDepth + 1,
                        false // Never force full expansion in recursion
                    );
                }
                
                result.hasMore = children.variables.length > maxChildren;
                result.metadata.objectKeyCount = children.variables.length;
                result.displayValue = this.createStructSummary(
                    variable.type,
                    Object.keys(result.children!),
                    result.hasMore
                );
            }
        } catch (error) {
            console.error(`❌ Error expanding children for ${variable.name}:`, error);
            result.displayValue = `${variable.type} {Error: ${error.message}}`;
            result.metadata.fullJSONAvailable = false;
        }
    }

    return result;
}
    /**
     * Parse Delve's debugging format: <*Type>(0xAddress) or <Type> (length: X, cap: Y)
     */
    protected parseDelveFormat(rawValue: string, typeName: string): any {
        // Pattern 1: <*Type>(0xAddress) - Pointer with address
        const pointerMatch = rawValue.match(/^<(\*?[^>]+)>\(([^)]+)\)$/);
        if (pointerMatch) {
            const [, type, address] = pointerMatch;
            return {
                type: 'pointer',
                originalType: type,
                memoryAddress: address,
                rawValue
            };
        }

        // Pattern 2: <Type> (length: X, cap: Y) - Collection
        const collectionMatch = rawValue.match(/^<([^>]+)>\s*\(([^)]+)\)$/);
        if (collectionMatch) {
            const [, type, info] = collectionMatch;
            const lengthMatch = info.match(/length:\s*(\d+)/);
            const capMatch = info.match(/cap:\s*(\d+)/);
            
            return {
                type: 'collection',
                originalType: type,
                length: lengthMatch ? parseInt(lengthMatch[1]) : 0,
                capacity: capMatch ? parseInt(capMatch[1]) : undefined,
                rawValue
            };
        }

        return null;
    }

    /**
     * Handle Delve format with proper addressing
     */
    protected handleDelveFormat(
        delveInfo: any,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        if (delveInfo.type === 'pointer') {
            const addressId = delveInfo.memoryAddress;
            
            // **CIRCULAR REFERENCE DETECTION**
            if (context.visited.has(addressId)) {
                console.log(`🔄 Circular reference detected at address: ${addressId}`);
                return this.createSimpleValue(`[↻ Circular: ${addressId}]`, delveInfo.originalType, {
                    isPointer: true,
                    memoryAddress: addressId,
                    circularRefId: addressId,
                    fullJSONAvailable: false
                });
            }

            // **CACHED REFERENCE REUSE**
            if (context.addressMap.has(addressId)) {
                const cached = context.addressMap.get(addressId)!;
                console.log(`♻️ Reusing cached reference: ${addressId}`);
                return {
                    ...cached,
                    displayValue: options.showPointerAddresses 
                        ? `[${addressId}] → ${cached.displayValue}`
                        : `→ ${cached.displayValue}`
                };
            }

            // **MARK AS VISITED for circular detection**
            context.visited.add(addressId);

            // Create expandable pointer representation
            const result = this.createSimpleValue(
                `→ ${delveInfo.originalType} {...}`,
                delveInfo.originalType,
                {
                    isPointer: true,
                    memoryAddress: addressId,
                    expandable: true,
                    recursionDepth: context.currentDepth,
                    fullJSONAvailable: true
                }
            );

            // **CACHE THE RESULT**
            context.addressMap.set(addressId, result);
            
            // **REMOVE FROM VISITED after processing**
            context.visited.delete(addressId);
            
            return result;
        }

        if (delveInfo.type === 'collection') {
            return this.createSimpleValue(
                `${delveInfo.originalType}[${delveInfo.length}]${delveInfo.capacity ? ` (cap: ${delveInfo.capacity})` : ''}`,
                delveInfo.originalType,
                {
                    arrayLength: delveInfo.length,
                    expandable: delveInfo.length > 0,
                    recursionDepth: context.currentDepth,
                    fullJSONAvailable: true
                }
            );
        }

        return this.createSimpleValue(delveInfo.rawValue, delveInfo.originalType, { fullJSONAvailable: true });
    }

  
    /**
     * Handle JSON with recursive parsing
     */
    protected handleJSONRecursively(
        rawValue: string,
        typeName: string,
        context: RecursionContext,
        options: SimplificationOptions
    ): SimplifiedValue {
        try {
            const parsed = JSON.parse(rawValue);
            const jsonType = `JSON(${typeof parsed})`;
            
            const childContext: RecursionContext = {
                ...context,
                currentDepth: context.currentDepth + 1
            };

            const result = this.recursivelySimplify(
                JSON.stringify(parsed, null, 2),
                jsonType,
                childContext,
                options
            );
            
            result.metadata.fullJSONAvailable = true;
            return result;
        } catch {
            return this.handlePrimitive(rawValue, typeName, options);
        }
    }

    /**
     * Handle primitive types (terminal case)
     */
    protected handlePrimitive(
        rawValue: string,
        typeName: string,
        options: SimplificationOptions
    ): SimplifiedValue {
        let displayValue = rawValue;

        // Clean up string quotes
        if (typeName === 'string' && displayValue.startsWith('"') && displayValue.endsWith('"')) {
            displayValue = displayValue.slice(1, -1);
        }

        // Smart truncation - but not for full expansion mode
        if (displayValue.length > options.maxStringLength && !options.forceFullExpansion) {
            return this.createTruncatedValue(
                displayValue.substring(0, options.maxStringLength),
                typeName,
                `String truncated (${displayValue.length} chars total)`
            );
        }

        return this.createSimpleValue(displayValue, typeName, { fullJSONAvailable: true });
    }

    // **ASYNC ON-DEMAND EXPANSION WITH FULL JSON SUPPORT**
    async expandVariableOnDemand(
        session: any,
        frameId: number,
        variableName: string,
        path: string[] = [],
        maxDepth: number = 3,
        forceFullExpansion: boolean = false
    ): Promise<SimplifiedValue | null> {
        const cacheKey = `${frameId}-${variableName}-${path.join('.')}-${maxDepth}-${forceFullExpansion}`;
        
        if (this.expansionCache.has(cacheKey)) {
            console.log(`♻️ Using cached expansion for: ${variableName}`);
            return this.expansionCache.get(cacheKey)!;
        }

        try {
            console.log(`🔍 [2025-06-09 16:08:51] On-demand expansion: ${variableName} at path: [${path.join(' → ')}] depth: ${maxDepth} ${forceFullExpansion ? '(FULL)' : ''}`);
            
            const scopes = await session.customRequest('scopes', { frameId });
            
            for (const scope of scopes.scopes) {
                const variables = await session.customRequest('variables', {
                    variablesReference: scope.variablesReference
                });
                
                const targetVar = variables.variables?.find((v: any) => v.name === variableName);
                if (targetVar) {
                    const expanded = await this.deepExpandVariable(
                        session,
                        targetVar,
                        path,
                        maxDepth,
                        0,
                        forceFullExpansion
                    );
                    
                    this.expansionCache.set(cacheKey, expanded);
                    console.log(`✅ Expansion complete for: ${variableName}`);
                    return expanded;
                }
            }
            
            return null;
        } catch (error) {
            console.error(`❌ Error expanding variable ${variableName}:`, error);
            return null;
        }
    }


    // **NEW: Generate complete JSON from SimplifiedValue**
    generateCompleteJSON(simplified: SimplifiedValue, currentDepth: number = 0, maxDepth: number = 6): any {
        if (currentDepth >= maxDepth) {
            return "[Max depth reached]";
        }

        if (simplified.metadata.isNil) {
            return null;
        }

        // Handle primitives
        if (!simplified.children || Object.keys(simplified.children).length === 0) {
            return this.parseDisplayValueToJSON(simplified.displayValue, simplified.originalType);
        }

        // Handle objects with children
        if (simplified.children) {
            const isArray = Object.keys(simplified.children).every(key => key.match(/^\[\d+\]$/));
            
            if (isArray) {
                // Handle arrays
                const array: any[] = [];
                Object.entries(simplified.children)
                    .sort(([a], [b]) => {
                        const aIndex = parseInt(a.replace(/[\[\]]/g, ''));
                        const bIndex = parseInt(b.replace(/[\[\]]/g, ''));
                        return aIndex - bIndex;
                    })
                    .forEach(([key, value]) => {
                        array.push(this.generateCompleteJSON(value, currentDepth + 1, maxDepth));
                    });
                return array;
                        } else {
                // Handle objects
                const obj: any = {};
                Object.entries(simplified.children).forEach(([key, value]) => {
                    obj[key] = this.generateCompleteJSON(value, currentDepth + 1, maxDepth);
                });
                return obj;
            }
        }

        return this.parseDisplayValueToJSON(simplified.displayValue, simplified.originalType);
    }

    protected parseDisplayValueToJSON(displayValue: string, type: string): any {
        if (!displayValue || displayValue === 'nil' || displayValue === '<nil>') {
            return null;
        }

        // Handle quoted strings
        if (displayValue.startsWith('"') && displayValue.endsWith('"')) {
            return displayValue.slice(1, -1);
        }

        // Handle booleans
        if (displayValue === 'true' || displayValue === 'false') {
            return displayValue === 'true';
        }

        // Handle numbers
        if (/^\d+$/.test(displayValue)) {
            return parseInt(displayValue);
        }

        if (/^\d+\.\d+$/.test(displayValue)) {
            return parseFloat(displayValue);
        }

        // Handle arrays
        if (displayValue.startsWith('[') && displayValue.endsWith(']')) {
            try {
                return JSON.parse(displayValue);
            } catch {
                return displayValue;
            }
        }

        // Handle objects
        if (displayValue.startsWith('{') && displayValue.endsWith('}')) {
            try {
                return JSON.parse(displayValue);
            } catch {
                return displayValue;
            }
        }

        return displayValue;
    }

    // **UTILITY METHODS**
    protected isPointerSyntax(rawValue: string, typeName: string): boolean {
        return (typeName.startsWith('*') && !rawValue.match(/^<[^>]+>\([^)]+\)$/)) ||
               rawValue.includes('*{') ||
               (rawValue.includes('0x') && !rawValue.match(/^<[^>]+>\([^)]+\)$/));
    }

    protected extractPointerValue(rawValue: string): string {
        const match = rawValue.match(/\*\w+\s*(\{.*\})/s);
        if (match) return match[1];
        
        const simpleMatch = rawValue.match(/\*\w+\s*(.+)/s);
        if (simpleMatch) return simpleMatch[1];
        
        return rawValue;
    }

    protected isPrimitiveType(typeName: string): boolean {
        const primitives = [
            'string', 'int', 'int8', 'int16', 'int32', 'int64',
            'uint', 'uint8', 'uint16', 'uint32', 'uint64',
            'float32', 'float64', 'bool', 'byte', 'rune',
            'time.Time', 'time.Duration'
        ];
        return primitives.some(p => typeName.includes(p));
    }

    protected isCollectionType(rawValue: string, typeName: string): boolean {
        return (
            typeName.includes('[]') || 
            typeName.includes('map[') ||
            typeName.includes('slice') ||
            rawValue.includes('len:') ||
            rawValue.includes('length:') ||
            /\[.*\]/.test(rawValue) ||
            (rawValue.startsWith('[') && rawValue.endsWith(']'))
        );
    }

    protected isStructuredType(rawValue: string, typeName: string): boolean {
        return (
            (rawValue.includes('{') && rawValue.includes('}')) ||
            typeName.includes('struct') ||
            (!this.isPrimitiveType(typeName) && !this.isCollectionType(rawValue, typeName))
        );
    }

    protected isPossibleJSON(rawValue: string): boolean {
        const trimmed = rawValue.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    protected isNilValue(rawValue: string): boolean {
        const nilPatterns = ['nil', 'null', '<nil>', 'undefined'];
        return nilPatterns.some(pattern => rawValue.trim() === pattern);
    }

    protected parseStructFields(rawValue: string): Record<string, string> {
        const fields: Record<string, string> = {};
        
        let content = rawValue.trim();
        if (content.startsWith('{') && content.endsWith('}')) {
            content = content.slice(1, -1);
        }

        let bracketDepth = 0;
        let currentField = '';
        let currentValue = '';
        let inField = true;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            
            if (char === '{' || char === '[') bracketDepth++;
            else if (char === '}' || char === ']') bracketDepth--;

            if (char === ':' && bracketDepth === 0 && inField) {
                inField = false;
                i++;
                continue;
            }

            if (char === ',' && bracketDepth === 0) {
                if (currentField.trim() && currentValue.trim()) {
                    fields[currentField.trim()] = currentValue.trim();
                }
                currentField = '';
                currentValue = '';
                inField = true;
                i++;
                continue;
            }

            if (inField) currentField += char;
            else currentValue += char;
            
            i++;
        }

        if (currentField.trim() && currentValue.trim()) {
            fields[currentField.trim()] = currentValue.trim();
        }

        return fields;
    }

    protected parseArrayElements(rawValue: string): string[] {
        let content = rawValue;
        content = content.replace(/len:\s*\d+,?\s*/g, '');
        content = content.replace(/cap:\s*\d+,?\s*/g, '');
        
        const arrayMatch = content.match(/\[(.*)\]/s);
        if (!arrayMatch) return [];
        
        const elements = [];
        let current = '';
        let depth = 0;
        let inQuotes = false;
        
        for (const char of arrayMatch[1]) {
            if (char === '"' && !inQuotes) inQuotes = true;
            else if (char === '"' && inQuotes) inQuotes = false;
            else if (!inQuotes) {
                if (char === '{' || char === '[') depth++;
                else if (char === '}' || char === ']') depth--;
                else if (char === ',' && depth === 0) {
                    if (current.trim()) elements.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        
        if (current.trim()) elements.push(current.trim());
        return elements;
    }

    protected sortChildrenByImportance(variables: any[]): any[] {
        return variables.sort((a, b) => {
            const aScore = this.calculateImportanceScore(a.name, a.value);
            const bScore = this.calculateImportanceScore(b.name, b.value);
            return bScore - aScore;
        });
    }

    protected calculateImportanceScore(name: string, value: string): number {
        let score = 0;
        const nameLower = name.toLowerCase();
        
        const highImportancePatterns = [
            'id', 'name', 'type', 'status', 'state', 'code', 'message', 'error',
            'result', 'response', 'data', 'value', 'content', 'body'
        ];
        
        const mediumImportancePatterns = [
            'time', 'date', 'timestamp', 'created', 'updated', 'modified',
            'count', 'length', 'size', 'total', 'amount', 'quantity'
        ];
        
        const lowImportancePatterns = [
            'internal', 'protected', 'temp', 'tmp', 'cache', 'buffer',
            'mutex', 'lock', 'sync', 'once', 'pool'
        ];
        
        if (highImportancePatterns.some(pattern => nameLower.includes(pattern))) score += 100;
        if (mediumImportancePatterns.some(pattern => nameLower.includes(pattern))) score += 50;
        if (lowImportancePatterns.some(pattern => nameLower.includes(pattern))) score -= 50;
        if (value && value !== 'nil' && value !== '<nil>' && value !== '0') score += 25;
        
        score -= name.length;
        if (value.includes('{') || value.includes('[')) score += 10;
        
        return score;
    }

    protected prioritizeFields(
        fields: Record<string, string>,
        businessFields: string[]
    ): Record<string, string> {
        const prioritized: Record<string, string> = {};
        
        businessFields.forEach(field => {
            const matchingKey = Object.keys(fields).find(key => 
                key.toLowerCase().includes(field.toLowerCase()) ||
                field.toLowerCase().includes(key.toLowerCase())
            );
            if (matchingKey && !(matchingKey in prioritized)) {
                prioritized[matchingKey] = fields[matchingKey];
            }
        });

        const remainingFields = Object.entries(fields)
            .filter(([key]) => !(key in prioritized))
            .sort(([a], [b]) => {
                const aScore = this.calculateImportanceScore(a, fields[a]);
                const bScore = this.calculateImportanceScore(b, fields[b]);
                return bScore - aScore;
            });

        remainingFields.forEach(([key, value]) => {
            prioritized[key] = value;
        });

        return prioritized;
    }

    protected createStructSummary(typeName: string, fields: string[], hasMore: boolean): string {
        const fieldList = fields.slice(0, 3).join(', ');
        const summary = `${typeName} {${fieldList}${fields.length > 3 ? '...' : ''}}`;
        return hasMore ? `${summary} (${fields.length} fields shown)` : summary;
    }

    protected inferFieldType(fieldName: string, value: string): string {
        if (value === 'nil' || value === 'null') return 'nil';
        if (value === 'true' || value === 'false') return 'bool';
        if (/^\d+$/.test(value)) return 'int';
        if (/^\d+\.\d+$/.test(value)) return 'float64';
        if (value.startsWith('"') && value.endsWith('"')) return 'string';
        if (value.includes('0x')) return 'pointer';
        if (value.startsWith('{') && value.endsWith('}')) return 'struct';
        if (value.startsWith('[') && value.endsWith(']')) return 'array';
        return 'interface{}';
    }

    protected inferElementType(element: string, containerType: string): string {
        const match = containerType.match(/\[\](.+)/);
        if (match) return match[1];
        return this.inferFieldType('', element);
    }

    protected createSimpleValue(
        displayValue: string,
        typeName: string,
        metadata: Partial<SimplifiedValue['metadata']> = {}
    ): SimplifiedValue {
        return {
            originalType: typeName,
            displayValue,
            isExpanded: false,
            hasMore: false,
            metadata: {
                isPointer: false,
                isNil: false,
                sizeEstimate: this.estimateSize(displayValue),
                fullJSONAvailable: false,
                ...metadata
            }
        };
    }

    protected createTruncatedValue(
        displayValue: string,
        typeName: string,
        reason: string
    ): SimplifiedValue {
        return {
            originalType: typeName,
            displayValue: `${displayValue.substring(0, 100)}... [${reason}]`,
            isExpanded: false,
            hasMore: true,
            metadata: {
                isPointer: false,
                isNil: false,
                truncatedAt: displayValue.length,
                expandable: true,
                fullJSONAvailable: false
            }
        };
    }

    protected estimateSize(value: string): number {
        if (!value) return 0;
        let size = value.length * 2;
        if (value.includes('{') || value.includes('[')) size *= 1.5;
        return Math.round(size);
    }

    // **PUBLIC API METHODS**
    async requestLazyExpansion(
        session: any,
        frameId: number,
        lazyLoadId: string,
        maxDepth: number = 3
    ): Promise<SimplifiedValue | null> {
        const request = this.lazyExpansionRequests.get(lazyLoadId);
        if (!request) return null;

        return await this.expandVariableOnDemand(
            request.session,
            request.frameId,
            request.variableName,
            request.path,
            maxDepth
        );
    }

    clearCache(): void {
        this.expansionCache.clear();
        this.lazyExpansionRequests.clear();
        console.log(`🧹 [2025-06-09 16:13:14] Cache cleared`);
    }

    getMemoryUsage(): number {
        return Array.from(this.expansionCache.values())
            .reduce((total, value) => total + (value.metadata.sizeEstimate || 0), 0);
    }

    getMemoryUsageFormatted(): string {
        const bytes = this.getMemoryUsage();
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    getCacheStats(): { entries: number; memoryUsage: string; hitRate: number } {
        return {
            entries: this.expansionCache.size,
            memoryUsage: this.getMemoryUsageFormatted(),
            hitRate: 0 // Could be calculated with hit/miss tracking
        };
    }
}
