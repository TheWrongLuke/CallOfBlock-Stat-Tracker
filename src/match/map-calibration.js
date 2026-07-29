const EPSILON = 1e-9;

export function fitMapCalibration(points) {
    const valid = (Array.isArray(points) ? points : []).map(normalizePoint).filter(Boolean);
    if (valid.length < 3) {
        return { valid: false, reason: "Add at least three calibration points." };
    }

    const normal = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    const imageX = [0, 0, 0];
    const imageY = [0, 0, 0];

    for (const point of valid) {
        const row = [point.worldX, point.worldZ, 1];
        for (let column = 0; column < 3; column += 1) {
            imageX[column] += row[column] * point.imageXPercent;
            imageY[column] += row[column] * point.imageYPercent;
            for (let other = 0; other < 3; other += 1) {
                normal[column][other] += row[column] * row[other];
            }
        }
    }

    const xCoefficients = solve3x3(normal, imageX);
    const yCoefficients = solve3x3(normal, imageY);
    if (!xCoefficients || !yCoefficients) {
        return {
            valid: false,
            reason: "The points are collinear or too close together. Choose locations spread across the map."
        };
    }

    const transform = {
        imageX: xCoefficients,
        imageY: yCoefficients
    };
    const pointErrors = valid.map((point) => {
        const projected = applyMapCalibration(transform, point.worldX, point.worldZ);
        return Math.hypot(projected.x - point.imageXPercent, projected.y - point.imageYPercent);
    });
    const rmsErrorPercent = Math.sqrt(pointErrors.reduce((sum, error) => sum + error * error, 0) / pointErrors.length);
    const determinant = xCoefficients[0] * yCoefficients[1] - xCoefficients[1] * yCoefficients[0];

    return {
        valid: true,
        transform,
        pointErrors,
        rmsErrorPercent,
        maxErrorPercent: Math.max(...pointErrors),
        translation: {
            imageXPercent: xCoefficients[2],
            imageYPercent: yCoefficients[2]
        },
        xScalePercentPerBlock: Math.hypot(xCoefficients[0], yCoefficients[0]),
        zScalePercentPerBlock: Math.hypot(xCoefficients[1], yCoefficients[1]),
        rotationDegrees: normalizeDegrees((Math.atan2(yCoefficients[0], xCoefficients[0]) * 180) / Math.PI),
        axisInverted: determinant < 0,
        determinant
    };
}

export function applyMapCalibration(transform, worldX, worldZ) {
    const x = Number(worldX);
    const z = Number(worldZ);
    const imageX = transform?.imageX;
    const imageY = transform?.imageY;
    if (
        !Number.isFinite(x) ||
        !Number.isFinite(z) ||
        !Array.isArray(imageX) ||
        !Array.isArray(imageY) ||
        imageX.length !== 3 ||
        imageY.length !== 3
    ) {
        return null;
    }
    return {
        x: imageX[0] * x + imageX[1] * z + imageX[2],
        y: imageY[0] * x + imageY[1] * z + imageY[2]
    };
}

function normalizePoint(point) {
    const worldX = Number(point?.worldX);
    const worldZ = Number(point?.worldZ);
    const imageXPercent = Number(point?.imageXPercent);
    const imageYPercent = Number(point?.imageYPercent);
    if (![worldX, worldZ, imageXPercent, imageYPercent].every(Number.isFinite)) return null;
    return { worldX, worldZ, imageXPercent, imageYPercent };
}

function solve3x3(matrix, vector) {
    const augmented = matrix.map((row, index) => [...row, vector[index]]);
    for (let pivot = 0; pivot < 3; pivot += 1) {
        let best = pivot;
        for (let row = pivot + 1; row < 3; row += 1) {
            if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
        }
        if (Math.abs(augmented[best][pivot]) < EPSILON) return null;
        [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];

        const divisor = augmented[pivot][pivot];
        for (let column = pivot; column < 4; column += 1) augmented[pivot][column] /= divisor;
        for (let row = 0; row < 3; row += 1) {
            if (row === pivot) continue;
            const factor = augmented[row][pivot];
            for (let column = pivot; column < 4; column += 1) {
                augmented[row][column] -= factor * augmented[pivot][column];
            }
        }
    }
    return augmented.map((row) => row[3]);
}

function normalizeDegrees(value) {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}
